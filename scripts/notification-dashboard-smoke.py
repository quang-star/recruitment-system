#!/usr/bin/env python3
"""Exercise dashboards and owned notification lifecycle through the Gateway."""

from __future__ import annotations

import argparse
import json
from typing import Any
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from uuid import uuid4


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        self.status = status
        super().__init__(f"HTTP {status}: {body}")


class Client:
    def __init__(self, gateway: str):
        self.gateway = gateway.rstrip("/")
        self.opener = build_opener(ProxyHandler({}))

    def request(self, method: str, path: str, payload: Any | None = None, token: str | None = None) -> Any:
        headers = {"Accept": "application/json", "User-Agent": "smart-recruitment-notification-smoke/1.0",
                   "X-Correlation-Id": str(uuid4())}
        body = None
        if payload is not None:
            body = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(f"{self.gateway}{path}", data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read()
        except HTTPError as error:
            raise ApiError(error.code, error.read().decode(errors="replace")) from error
        return json.loads(raw) if raw else None


def login(client: Client, email: str, password: str) -> dict[str, Any]:
    return client.request("POST", "/api/v1/auth/login", {"email": email, "password": password,
                          "clientType": "WEB", "deviceName": "Notification dashboard smoke"})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gateway-url", default="http://localhost:8080")
    parser.add_argument("--recruiter-email", default="recruiter.demo@smart.local")
    parser.add_argument("--recruiter-password", default="DemoRecruiter!2026")
    parser.add_argument("--candidate-email", default="candidate.demo@smart.local")
    parser.add_argument("--candidate-password", default="DemoCandidate!2026")
    parser.add_argument("--company-slug", default="smart-recruitment-demo")
    args = parser.parse_args()

    client = Client(args.gateway_url)
    recruiter = login(client, args.recruiter_email, args.recruiter_password)
    candidate = login(client, args.candidate_email, args.candidate_password)
    companies = client.request("GET", "/api/v1/companies", token=recruiter["accessToken"])
    company = next(value for value in companies if value["slug"] == args.company_slug)
    company_id = company["companyId"]

    recruiter_dashboard = client.request("GET", f"/api/v1/dashboard?companyId={company_id}",
                                         token=recruiter["accessToken"])
    candidate_dashboard = client.request("GET", "/api/v1/dashboard", token=candidate["accessToken"])
    assert recruiter_dashboard["audience"] == "RECRUITER"
    assert recruiter_dashboard["metrics"]["jobs"] >= 3
    assert recruiter_dashboard["metrics"]["applications"] >= 3
    assert candidate_dashboard["audience"] == "CANDIDATE"
    assert candidate_dashboard["metrics"]["applications"] >= 3
    print("  candidate/recruiter dashboards: passed with persisted demo counts")

    jobs = client.request("GET", f"/api/v1/companies/{company_id}/jobs", token=recruiter["accessToken"])
    applications = []
    for job in jobs:
        applications.extend(client.request("GET", f"/api/v1/recruiter/applications?jobId={job['jobId']}",
                                           token=recruiter["accessToken"]))
    submitted = next((value for value in applications if value["status"] == "SUBMITTED"), None)
    if submitted is not None:
        reviewed = client.request("PATCH", f"/api/v1/recruiter/applications/{submitted['applicationId']}/status",
                                  {"status": "UNDER_REVIEW", "reason": None, "version": submitted["version"]},
                                  recruiter["accessToken"])
        feed = client.request("GET", "/api/v1/notifications?limit=30", token=candidate["accessToken"])
        notification = next(value for value in feed["items"] if value["type"] == "APPLICATION_STATUS_CHANGED"
                            and value["readAt"] is None)
        try:
            client.request("PATCH", f"/api/v1/notifications/{notification['notificationId']}/read?version={notification['version']}",
                           token=recruiter["accessToken"])
        except ApiError as error:
            if error.status != 404:
                raise
        else:
            raise AssertionError("Another user was allowed to mark the candidate notification as read")
        client.request("PATCH", f"/api/v1/notifications/{notification['notificationId']}/read?version={notification['version']}",
                       token=candidate["accessToken"])
        client.request("PATCH", f"/api/v1/recruiter/applications/{reviewed['applicationId']}/status",
                       {"status": "SHORTLISTED", "reason": None, "version": reviewed["version"]},
                       recruiter["accessToken"])
        print("  status event → owned notification → mark read → next unread event: passed")
    else:
        feed = client.request("GET", "/api/v1/notifications?limit=30", token=candidate["accessToken"])
        assert any(value["type"] == "APPLICATION_STATUS_CHANGED" for value in feed["items"])
        print("  existing status notification reused; no SUBMITTED demo application remained")

    final_feed = client.request("GET", "/api/v1/notifications?limit=30", token=candidate["accessToken"])
    assert any(value["type"] == "APPLICATION_STATUS_CHANGED" for value in final_feed["items"])
    assert final_feed["unreadCount"] >= 1
    final_dashboard = client.request("GET", "/api/v1/dashboard", token=candidate["accessToken"])
    assert final_dashboard["metrics"]["shortlisted"] >= 1
    assert final_dashboard["metrics"]["unreadNotifications"] >= 1
    print("  unread counter and shortlisted dashboard projection: passed")
    print("Notification/dashboard smoke passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
