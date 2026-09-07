#!/usr/bin/env python3
"""Idempotently seed and verify the local demo through public Gateway APIs."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sys
import time
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import ProxyHandler, Request, build_opener
from uuid import UUID, uuid4, uuid5


DEMO_NAMESPACE = UUID("f2c2b6a8-2f5c-4c37-b124-b733855e5ac7")


class ApiFailure(RuntimeError):
    def __init__(self, status: int, payload: Any, method: str, url: str):
        self.status = status
        self.payload = payload
        message = payload.get("message") if isinstance(payload, dict) else str(payload)
        super().__init__(f"{method} {url} returned HTTP {status}: {message}")


class HttpClient:
    def __init__(self, gateway_url: str, mailpit_url: str):
        self.gateway_url = gateway_url.rstrip("/")
        self.mailpit_url = mailpit_url.rstrip("/")
        self.opener = build_opener(ProxyHandler({}))

    def json(
        self,
        method: str,
        path: str,
        *,
        payload: Any | None = None,
        token: str | None = None,
        headers: dict[str, str] | None = None,
        mailpit: bool = False,
    ) -> Any:
        base = self.mailpit_url if mailpit else self.gateway_url
        url = f"{base}{path}"
        request_headers = {
            "Accept": "application/json",
            "User-Agent": "smart-recruitment-demo-seed/1.0",
            "X-Correlation-Id": str(uuid4()),
        }
        body = None
        if payload is not None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            request_headers["Content-Type"] = "application/json"
        if token:
            request_headers["Authorization"] = f"Bearer {token}"
        if headers:
            request_headers.update(headers)
        request = Request(url, data=body, headers=request_headers, method=method)
        raw = self._open(request)
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exception:
            raise RuntimeError(f"{method} {url} returned malformed JSON") from exception

    def multipart_pdf(self, path: str, title: str, filename: str, content: bytes, token: str) -> Any:
        boundary = f"smart-recruitment-{uuid4().hex}"
        chunks = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n{title}\r\n".encode(),
            (
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                f"filename=\"{filename}\"\r\nContent-Type: application/pdf\r\n\r\n"
            ).encode(),
            content,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        body = b"".join(chunks)
        url = f"{self.gateway_url}{path}"
        request = Request(
            url,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": str(len(body)),
                "User-Agent": "smart-recruitment-demo-seed/1.0",
                "X-Correlation-Id": str(uuid4()),
            },
        )
        raw = self._open(request)
        return json.loads(raw.decode("utf-8"))

    def bytes(self, path: str, token: str) -> tuple[bytes, dict[str, str]]:
        url = f"{self.gateway_url}{path}"
        request = Request(
            url,
            method="GET",
            headers={
                "Accept": "application/pdf",
                "Authorization": f"Bearer {token}",
                "User-Agent": "smart-recruitment-demo-seed/1.0",
                "X-Correlation-Id": str(uuid4()),
            },
        )
        try:
            with self.opener.open(request, timeout=30) as response:
                return response.read(), {key.lower(): value for key, value in response.headers.items()}
        except HTTPError as exception:
            raw = exception.read()
            raise ApiFailure(exception.code, self._payload(raw), "GET", url) from exception
        except URLError as exception:
            raise RuntimeError(f"GET {url} failed: {exception.reason}") from exception

    def _open(self, request: Request) -> bytes:
        try:
            with self.opener.open(request, timeout=30) as response:
                return response.read()
        except HTTPError as exception:
            raw = exception.read()
            raise ApiFailure(exception.code, self._payload(raw), request.method, request.full_url) from exception
        except URLError as exception:
            raise RuntimeError(f"{request.method} {request.full_url} failed: {exception.reason}") from exception

    @staticmethod
    def _payload(raw: bytes) -> Any:
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return raw.decode("utf-8", errors="replace")


def wait_for(label: str, operation: Callable[[], Any], timeout: int = 120) -> Any:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            value = operation()
            if value is not None:
                return value
        except ApiFailure as exception:
            if exception.status not in {400, 404, 409, 502, 503}:
                raise
            last_error = exception
        time.sleep(2)
    suffix = f" Last response: {last_error}" if last_error else ""
    raise TimeoutError(f"Timed out while waiting for {label}.{suffix}")


def login(client: HttpClient, email: str, password: str) -> dict[str, Any]:
    return client.json(
        "POST",
        "/api/v1/auth/login",
        payload={
            "email": email,
            "password": password,
            "clientType": "WEB",
            "deviceName": "Local demo seed",
        },
    )


def verification_token(client: HttpClient, email: str) -> str | None:
    messages = client.json("GET", "/api/v1/messages", mailpit=True).get("messages", [])
    for message in messages:
        recipients = [recipient.get("Address", "").casefold() for recipient in message.get("To", [])]
        if email.casefold() not in recipients:
            continue
        match = re.search(r"token=([0-9a-f]{64})", message.get("Snippet", ""))
        if match:
            return match.group(1)
    return None


def ensure_account(client: HttpClient, email: str, password: str, account_type: str) -> dict[str, Any]:
    try:
        session = login(client, email, password)
        print(f"  account {email}: existing active account")
        return session
    except ApiFailure as exception:
        if exception.status != 401:
            raise

    try:
        client.json(
            "POST",
            "/api/v1/auth/register",
            payload={"email": email, "password": password, "accountType": account_type},
        )
        print(f"  account {email}: registered")
    except ApiFailure as exception:
        if exception.status != 409:
            raise

    token = wait_for(f"verification email for {email}", lambda: verification_token(client, email), timeout=30)
    try:
        client.json("POST", "/api/v1/auth/verify-email", payload={"token": token})
        print(f"  account {email}: email verified")
    except ApiFailure as exception:
        if exception.status != 409:
            raise
    return wait_for(f"login for {email}", lambda: login(client, email, password), timeout=30)


def get_or_none(client: HttpClient, path: str, token: str) -> Any | None:
    try:
        return client.json("GET", path, token=token)
    except ApiFailure as exception:
        if exception.status == 404:
            return None
        raise


def ensure_profiles(client: HttpClient, recruiter_token: str, candidate_token: str) -> None:
    recruiter = get_or_none(client, "/api/v1/recruiter/profile", recruiter_token)
    if recruiter is None:
        recruiter = client.json(
            "PUT",
            "/api/v1/recruiter/profile",
            token=recruiter_token,
            payload={
                "displayName": "Demo Recruiter",
                "businessTitle": "Technical Recruiter",
                "businessPhone": "+84900000001",
                "version": None,
            },
        )
        print(f"  recruiter profile: created {recruiter['recruiterProfileId']}")
    else:
        print(f"  recruiter profile: existing {recruiter['recruiterProfileId']}")

    candidate = get_or_none(client, "/api/v1/candidates/me", candidate_token)
    if candidate is None:
        candidate = client.json(
            "PUT",
            "/api/v1/candidates/me",
            token=candidate_token,
            payload={
                "displayName": "Demo Candidate",
                "headline": "Backend Java Engineer",
                "locationText": "Ho Chi Minh City",
                "visibility": "APPLICATION_ONLY",
                "version": None,
            },
        )
        print(f"  candidate profile: created {candidate['candidateProfileId']}")
    else:
        print(f"  candidate profile: existing {candidate['candidateProfileId']}")


def ensure_company(client: HttpClient, token: str) -> dict[str, Any]:
    companies = client.json("GET", "/api/v1/companies", token=token)
    company = next((item for item in companies if item["slug"] == "smart-recruitment-demo"), None)
    if company is not None:
        print(f"  company: existing {company['companyId']}")
        return company
    company = client.json(
        "POST",
        "/api/v1/companies",
        token=token,
        payload={
            "legalName": "Smart Recruitment Demo Company Limited",
            "displayName": "Smart Recruitment Demo",
            "slug": "smart-recruitment-demo",
            "description": "Local demonstration tenant for the graduation project.",
            "websiteUrl": "https://example.invalid/smart-recruitment-demo",
            "countryCode": "VN",
            "registrationNumber": "DEMO-2026",
            "sizeRange": "51-200",
            "version": None,
        },
    )
    print(f"  company: created {company['companyId']}")
    return company


def job_specs() -> list[dict[str, Any]]:
    common = {
        "benefitsText": "Competitive salary, learning budget, flexible working hours.",
        "locationText": "Ho Chi Minh City",
        "countryCode": "VN",
        "workMode": "HYBRID",
        "employmentType": "FULL_TIME",
        "openings": 2,
        "salaryMin": 25000000,
        "salaryMax": 45000000,
        "salaryCurrency": "VND",
        "salaryPeriod": "MONTH",
        "salaryNegotiable": True,
        "applicationDeadline": "2030-12-31T23:59:59+07:00",
        "version": None,
    }
    return [
        common | {
            "title": "Senior Backend Java Engineer",
            "description": "Design and build reliable recruitment services. Maintain APIs and deploy event-driven workloads.",
            "requirementsText": "Required: 3 years Java, Spring Boot, PostgreSQL, Docker and Kafka.\nPreferred: Kubernetes and AWS.",
            "seniorityLevel": "SENIOR",
        },
        common | {
            "title": "Frontend React Engineer",
            "description": "Build accessible recruiter and candidate interfaces. Test and maintain reusable web components.",
            "requirementsText": "Required: 2 years TypeScript, React, HTML and CSS.\nPreferred: Docker and REST API experience.",
            "seniorityLevel": "MIDDLE",
        },
        common | {
            "title": "Data Python Engineer",
            "description": "Develop data pipelines and matching analytics. Build observable batch and streaming workloads.",
            "requirementsText": "Required: 2 years Python, SQL, PostgreSQL and Kafka.\nPreferred: Docker, Kubernetes and AWS.",
            "seniorityLevel": "MIDDLE",
        },
    ]


def ensure_job_published(client: HttpClient, token: str, job: dict[str, Any]) -> dict[str, Any]:
    if job["status"] == "PUBLISHED":
        return job
    if job["status"] != "DRAFT":
        raise RuntimeError(f"Demo Job {job['jobId']} is unexpectedly {job['status']}")

    parsed = wait_for(
        f"ParsedJD {job['jobVersionId']}",
        lambda: get_or_none(client, f"/api/v1/parsed-jds/{job['jobVersionId']}", token),
    )
    if parsed["status"] != "CONFIRMED":
        parsed = client.json(
            "POST",
            f"/api/v1/parsed-jds/{job['jobVersionId']}/confirm",
            token=token,
            payload={"expectedRevisionId": parsed["revisionId"]},
        )
        print(f"    ParsedJD confirmed: {parsed['revisionId']}")

    def publish() -> dict[str, Any] | None:
        current = client.json("GET", f"/api/v1/jobs/{job['jobId']}", token=token)
        if current["status"] == "PUBLISHED":
            return current
        try:
            return client.json(
                "POST",
                f"/api/v1/jobs/{job['jobId']}/publish?version={current['version']}",
                token=token,
            )
        except ApiFailure as exception:
            if exception.status in {400, 409}:
                return None
            raise

    return wait_for(f"publish Job {job['jobId']}", publish)


def ensure_jobs(client: HttpClient, token: str, company_id: str) -> list[dict[str, Any]]:
    jobs = client.json("GET", f"/api/v1/companies/{company_id}/jobs", token=token)
    seeded: list[dict[str, Any]] = []
    for spec in job_specs():
        job = next((item for item in jobs if item["title"] == spec["title"]), None)
        if job is None:
            job = client.json(
                "POST",
                f"/api/v1/companies/{company_id}/jobs",
                token=token,
                payload=spec,
            )
            jobs.append(job)
            print(f"  Job {spec['title']}: created {job['jobId']}")
        else:
            print(f"  Job {spec['title']}: existing {job['jobId']}")
        job = ensure_job_published(client, token, job)
        print(f"    state: {job['status']}")
        seeded.append(job)
    return seeded


def demo_pdf() -> bytes:
    lines = [
        "DEMO CANDIDATE - BACKEND JAVA ENGINEER",
        "Professional Summary",
        "Backend software engineer with 5 years of experience building reliable APIs and data services.",
        "Experience 01/2021 - Present",
        "Develop and maintain Java and Spring Boot microservices with PostgreSQL and REST APIs.",
        "Build Kafka event pipelines and deploy services with Docker, Kubernetes and AWS.",
        "Test backend applications and collaborate with React and TypeScript frontend teams.",
        "Skills",
        "Java, Spring Boot, PostgreSQL, SQL, Kafka, Docker, Kubernetes, AWS, Python, REST API",
        "React, TypeScript, HTML, CSS, Git",
        "Education",
        "Bachelor of Software Engineering - anonymized demo profile",
    ]
    escaped = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    stream = "BT /F1 11 Tf 54 790 Td 15 TL " + " Tj T* ".join(f"({line})" for line in escaped) + " Tj ET"
    stream_bytes = stream.encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream_bytes)} >>\nstream\n".encode() + stream_bytes + b"\nendstream",
    ]
    document = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(document))
        document.extend(f"{number} 0 obj\n".encode())
        document.extend(obj)
        document.extend(b"\nendobj\n")
    xref = len(document)
    document.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    document.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        document.extend(f"{offset:010d} 00000 n \n".encode())
    document.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(document)


def ensure_cv(client: HttpClient, token: str) -> dict[str, Any]:
    title = "Demo Backend Engineer CV"
    cvs = client.json("GET", "/api/v1/cvs", token=token)
    cv = next((item for item in cvs if item["title"] == title), None)
    if cv is None:
        cv = client.multipart_pdf("/api/v1/cvs", title, "demo-candidate-cv.pdf", demo_pdf(), token)
        print(f"  CV: uploaded {cv['cvId']}")
    else:
        print(f"  CV: existing {cv['cvId']}")
    version_id = cv["activeVersion"]["cvVersionId"]
    parsed = wait_for(
        f"ParsedCV {version_id}",
        lambda: get_or_none(client, f"/api/v1/parsed-cvs/{version_id}", token),
    )
    if parsed["status"] != "CONFIRMED":
        parsed = client.json(
            "POST",
            f"/api/v1/parsed-cvs/{version_id}/confirm",
            token=token,
            payload={"expectedRevisionId": parsed["revisionId"]},
        )
        print(f"    ParsedCV confirmed: {parsed['revisionId']}")

    def confirmed() -> dict[str, Any] | None:
        current = client.json("GET", f"/api/v1/cvs/{cv['cvId']}", token=token)
        return current if current["activeVersion"]["processingStatus"] == "CONFIRMED" else None

    return wait_for(f"Core CV confirmation {version_id}", confirmed)


def ensure_applications(
    client: HttpClient,
    candidate_token: str,
    recruiter_token: str,
    cv: dict[str, Any],
    jobs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    existing = client.json("GET", "/api/v1/candidate/applications", token=candidate_token)
    applications: list[dict[str, Any]] = []
    for job in jobs:
        application = next((item for item in existing if item["jobId"] == job["jobId"]), None)
        if application is None:
            idempotency_key = f"demo-{uuid5(DEMO_NAMESPACE, job['jobId'])}"
            application = client.json(
                "POST",
                "/api/v1/candidate/applications",
                token=candidate_token,
                headers={"Idempotency-Key": idempotency_key},
                payload={
                    "jobId": job["jobId"],
                    "cvId": cv["cvId"],
                    "cvVersionId": cv["activeVersion"]["cvVersionId"],
                    "coverLetter": f"Demo application for {job['title']}. Submitted through the public Gateway API.",
                    "consentAccepted": True,
                    "policyVersion": "demo-cv-sharing-v1",
                },
            )
            existing.append(application)
            print(f"  application {job['title']}: submitted {application['applicationId']}")
        else:
            print(f"  application {job['title']}: existing {application['applicationId']}")

        def matching() -> dict[str, Any] | None:
            return get_or_none(client, f"/api/v1/applications/{application['applicationId']}/match", recruiter_token)

        match = wait_for(f"matching result {application['applicationId']}", matching)
        print(
            f"    match: {match['status']} score={match['finalScore']:.2f} "
            f"algorithm={match['algorithmVersion']} taxonomy={match['taxonomyVersion']}"
        )
        recruiter_items = client.json(
            "GET", f"/api/v1/recruiter/applications?jobId={quote(job['jobId'])}", token=recruiter_token
        )
        if not any(item["applicationId"] == application["applicationId"] for item in recruiter_items):
            raise RuntimeError("Recruiter pipeline did not expose the submitted application")
        applications.append(application)

    first = applications[0]
    if first["status"] == "SUBMITTED":
        first = client.json(
            "PATCH",
            f"/api/v1/recruiter/applications/{first['applicationId']}/status",
            token=recruiter_token,
            payload={"status": "UNDER_REVIEW", "reason": "Demo review started", "version": first["version"]},
        )
        print(f"  application {first['applicationId']}: moved to UNDER_REVIEW")
    if first["status"] == "UNDER_REVIEW":
        first = client.json(
            "PATCH",
            f"/api/v1/recruiter/applications/{first['applicationId']}/status",
            token=recruiter_token,
            payload={"status": "SHORTLISTED", "reason": "Strong demo match", "version": first["version"]},
        )
        applications[0] = first
        print(f"  application {first['applicationId']}: moved to SHORTLISTED")
    history = client.json("GET", f"/api/v1/applications/{first['applicationId']}/history", token=candidate_token)
    if not history:
        raise RuntimeError("Application history is unexpectedly empty")
    content, headers = client.bytes(f"/api/v1/recruiter/applications/{first['applicationId']}/cv", recruiter_token)
    if not content.startswith(b"%PDF-") or headers.get("content-type", "").split(";", 1)[0] != "application/pdf":
        raise RuntimeError("Recruiter CV download did not return the immutable PDF snapshot")
    print(f"  recruiter CV download: verified {len(content)} bytes; history entries={len(history)}")
    return applications


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gateway-url", default=os.getenv("GATEWAY_URL", "http://localhost:8080"))
    parser.add_argument("--mailpit-url", default=os.getenv("MAILPIT_URL", "http://localhost:8025"))
    parser.add_argument("--recruiter-email", default=os.getenv("DEMO_RECRUITER_EMAIL", "recruiter.demo@smart.local"))
    parser.add_argument("--candidate-email", default=os.getenv("DEMO_CANDIDATE_EMAIL", "candidate.demo@smart.local"))
    parser.add_argument("--recruiter-password", default=os.getenv("DEMO_RECRUITER_PASSWORD", "DemoRecruiter!2026"))
    parser.add_argument("--candidate-password", default=os.getenv("DEMO_CANDIDATE_PASSWORD", "DemoCandidate!2026"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    client = HttpClient(args.gateway_url, args.mailpit_url)
    print("Seeding demo through Gateway APIs")
    recruiter = ensure_account(client, args.recruiter_email, args.recruiter_password, "RECRUITER")
    candidate = ensure_account(client, args.candidate_email, args.candidate_password, "CANDIDATE")
    recruiter_token = recruiter["accessToken"]
    candidate_token = candidate["accessToken"]
    ensure_profiles(client, recruiter_token, candidate_token)
    company = ensure_company(client, recruiter_token)
    jobs = ensure_jobs(client, recruiter_token, company["companyId"])
    cv = ensure_cv(client, candidate_token)
    applications = ensure_applications(client, candidate_token, recruiter_token, cv, jobs)
    print(
        f"Demo ready: company={company['companyId']} jobs={len(jobs)} "
        f"cv={cv['cvId']} applications={len(applications)}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ApiFailure, RuntimeError, TimeoutError) as exception:
        print(f"Demo seed failed: {exception}", file=sys.stderr)
        raise SystemExit(1) from exception
