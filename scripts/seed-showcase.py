#!/usr/bin/env python3
"""Idempotently seed the full realistic showcase dataset for local or Coolify deployments.

All business entities (categories, skills, companies, approvals, jobs, ParsedJDs,
candidate profiles, PDF CVs, ParsedCVs, CV Builder drafts, applications, matching
scores, and Kanban stage transitions) flow strictly through Gateway API v2.

On a Coolify Ubuntu host where real SMTP is configured instead of Mailpit, pass
`--auto-postgres` (or `--postgres-container <container>`) and `--gateway-url http://127.0.0.1:5173`
to bootstrap/activate synthetic `@smart.local` accounts in `auth_db` without
sending bounce emails through your external SMTP provider.
"""
from __future__ import annotations

import argparse
import base64
from datetime import UTC, datetime, timedelta
import getpass
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID, uuid5

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = Path(__file__).with_name("seed-showcase-data.json")
SHOWCASE_NAMESPACE = UUID("6e835566-851c-4a62-8b91-781b39e51944")

_demo_spec = importlib.util.spec_from_file_location("showcase_demo_helpers", Path(__file__).with_name("seed-demo.py"))
assert _demo_spec and _demo_spec.loader
demo = importlib.util.module_from_spec(_demo_spec)
_demo_spec.loader.exec_module(demo)

STAGE_PATHS: dict[str, list[str]] = {
    "SUBMITTED": [],
    "UNDER_REVIEW": ["UNDER_REVIEW"],
    "SHORTLISTED": ["UNDER_REVIEW", "SHORTLISTED"],
    "INTERVIEW": ["UNDER_REVIEW", "SHORTLISTED", "INTERVIEW"],
    "OFFERED": ["UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "OFFERED"],
    "HIRED": ["UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "OFFERED", "HIRED"],
    "REJECTED": ["UNDER_REVIEW", "REJECTED"],
}
ALLOWED_SKILL_TYPES = {
    "language", "framework", "library", "database", "cloud", "devops",
    "testing", "data_ai", "security", "methodology", "soft_skill", "other",
}
ALLOWED_SKILL_CATEGORIES = {
    "backend", "frontend", "fullstack", "mobile", "devops",
    "data_ai", "qa", "security", "cross_functional",
}


def numeric_id(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]{0,18}", value) or int(value) > 9223372036854775807:
        raise ValueError("API v2 must return positive BIGINT IDs as decimal strings")
    return value


def gateway_origin(value: str) -> str:
    parsed = urlsplit(value)
    loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or (parsed.scheme == "http" and not loopback)
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise argparse.ArgumentTypeError(
            "Use a loopback http(s) origin (e.g. http://127.0.0.1:5173) or a public https:// origin"
        )
    return value.rstrip("/")


def _key(value: str) -> str:
    return " ".join(value.split()).casefold()


def render_cv_pdf(pdf_spec: dict[str, Any]) -> bytes:
    """Render a clean multi-section embedded-text A4 PDF using 100% Python stdlib."""
    def esc(text: str) -> str:
        ascii_text = text.encode("ascii", errors="ignore").decode("ascii")
        return ascii_text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def wrap(text: str, width: int = 88) -> list[str]:
        words = text.split()
        lines: list[str] = []
        current = ""
        for word in words:
            if not current:
                current = word
            elif len(current) + 1 + len(word) <= width:
                current += " " + word
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines or [""]

    ops: list[str] = ["BT", "50 792 Td"]
    ops.append(f"/F2 16 Tf ({esc(pdf_spec['fullName'])}) Tj")
    ops.append("0 -18 Td")
    ops.append(f"/F2 11 Tf ({esc(pdf_spec['headline'])}) Tj")
    ops.append("0 -15 Td")
    ops.append(f"/F1 9.5 Tf ({esc(pdf_spec['contactLine'])}) Tj")
    ops.append("0 -18 Td")

    sections = [
        ("Professional Summary", [pdf_spec["summary"]]),
        ("Work Experience", list(pdf_spec["experience"])),
        ("Technical Skills", [pdf_spec["skills"]]),
        ("Projects", list(pdf_spec.get("projects", []))),
        ("Education", list(pdf_spec["education"])),
        ("Languages", list(pdf_spec["languages"])),
        ("Certifications", list(pdf_spec.get("certificates", []))),
    ]
    for heading, items in sections:
        if not items:
            continue
        ops.append(f"/F2 11 Tf ({esc(heading)}) Tj")
        ops.append("0 -14 Td")
        ops.append("/F1 9.5 Tf")
        for item in items:
            for line in wrap(str(item), 90):
                ops.append(f"({esc(line)}) Tj")
                ops.append("0 -12.5 Td")
        ops.append("0 -5 Td")
    ops.append("ET")
    stream_bytes = "\n".join(ops).encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>"
        ),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
        f"<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin-1") + stream_bytes + b"\nendstream",
    ]
    doc = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(doc))
        doc.extend(f"{idx} 0 obj\n".encode("latin-1"))
        doc.extend(obj)
        doc.extend(b"\nendobj\n")
    xref = len(doc)
    doc.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("latin-1"))
    for offset in offsets[1:]:
        doc.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    doc.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("latin-1")
    )
    return bytes(doc)


def load_showcase_fixture(path: Path, *, web_public_dir: Path | None = None) -> dict[str, Any]:
    raw_text = path.read_text(encoding="utf-8")
    if re.search(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", raw_text):
        raise ValueError("Showcase fixture must not hardcode UUID identities")
    payload = json.loads(raw_text)
    if not isinstance(payload, dict) or payload.get("schemaVersion") != "showcase-seed/1.0" or payload.get("synthetic") is not True:
        raise ValueError("Expected synthetic showcase-seed/1.0 fixture")

    catalog = payload.get("catalog")
    companies = payload.get("companies")
    candidates = payload.get("candidates")
    if not isinstance(catalog, dict) or not isinstance(companies, list) or not isinstance(candidates, list):
        raise ValueError("Invalid top-level showcase fixture sections")
    if not 1 <= len(companies) <= 100:
        raise ValueError("Fixture must contain 1–100 companies")

    for skill in catalog.get("extraSkills", []):
        if skill.get("type") not in ALLOWED_SKILL_TYPES or skill.get("category") not in ALLOWED_SKILL_CATEGORIES:
            raise ValueError(f"Invalid skill type/category for {skill.get('name')}")
        if not isinstance(skill.get("name"), str) or not 1 <= len(skill["name"].strip()) <= 160:
            raise ValueError("Invalid skill name")

    public_dir = web_public_dir if web_public_dir is not None else (ROOT / "web" / "public")
    slugs: set[str] = set()
    regs: set[str] = set()
    company_map: dict[str, dict[str, Any]] = {}

    for group in companies:
        if not isinstance(group, dict) or not isinstance(group.get("approve"), bool):
            raise ValueError("Each company group requires boolean approve")
        company = group.get("company")
        jobs = group.get("jobs")
        if not isinstance(company, dict) or not isinstance(jobs, list) or not jobs:
            raise ValueError("Each company group requires company object and non-empty jobs")
        if {"id", "public_id", "publicId", "companyId", "status", "verificationStatus"}.intersection(company):
            raise ValueError("Company fixture must not force IDs or review statuses")
        slug = company.get("slug", "")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug in slugs:
            raise ValueError(f"Invalid or duplicate company slug: {slug}")
        slugs.add(slug)
        reg = company.get("registrationNumber")
        if not isinstance(reg, str) or not reg.strip() or reg in regs:
            raise ValueError(f"Invalid or duplicate registrationNumber on {slug}")
        regs.add(reg)
        for media_key in ("logoUrl", "coverImageUrl"):
            media = company.get(media_key, "")
            if not isinstance(media, str) or not media.startswith("/") or media.startswith("//") or ".." in media:
                raise ValueError(f"Invalid {media_key} on {slug}")
            if public_dir.is_dir() and not (public_dir / media.lstrip("/")).is_file():
                raise ValueError(f"Missing static asset {media} for {slug}")
        seen_titles: set[str] = set()
        for job in jobs:
            if {"id", "jobId", "jobVersionId", "status"}.intersection(job):
                raise ValueError("Job fixture must not force IDs or status")
            if job.get("externalAiConsent") is not False:
                raise ValueError("Showcase seeding must keep externalAiConsent=False")
            title = job.get("title", "")
            if not isinstance(title, str) or not title.strip() or len(title) > 240 or title in seen_titles:
                raise ValueError(f"Invalid or duplicate job title in {slug}: {title}")
            seen_titles.add(title)
            if job.get("workMode") not in {"ONSITE", "HYBRID", "REMOTE"}:
                raise ValueError(f"Invalid workMode in {slug}: {title}")
            if job.get("employmentType") not in {"FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP"}:
                raise ValueError(f"Invalid employmentType in {slug}: {title}")
            if not isinstance(job.get("categoryRef"), dict):
                raise ValueError(f"Missing categoryRef in {slug}: {title}")
        company_map[slug] = group

    seen_emails: set[str] = set()
    for cand in candidates:
        email = str(cand.get("email", "")).strip().casefold()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or email in seen_emails:
            raise ValueError(f"Candidate emails in showcase fixture must be unique valid addresses: {email}")
        seen_emails.add(email)
        cvs = cand.get("cvs", [])
        if not isinstance(cvs, list) or not cvs:
            raise ValueError(f"Candidate {email} requires at least one CV")
        cv_keys = {cv["key"] for cv in cvs}
        for cv in cvs:
            pdf_bytes = render_cv_pdf(cv["pdfContent"])
            if not pdf_bytes.startswith(b"%PDF-1.4"):
                raise ValueError(f"Failed to render valid PDF for {email}")
        seen_apps: set[tuple[str, int]] = set()
        for app in cand.get("applications", []):
            target_slug = app.get("companySlug")
            idx = app.get("jobIndex")
            if target_slug not in company_map or not company_map[target_slug]["approve"]:
                raise ValueError(f"Application references invalid or unapproved company {target_slug}")
            if not isinstance(idx, int) or not 0 <= idx < len(company_map[target_slug]["jobs"]):
                raise ValueError(f"Invalid jobIndex {idx} for {target_slug}")
            if (target_slug, idx) in seen_apps:
                raise ValueError(f"Duplicate application target {(target_slug, idx)} for {email}")
            seen_apps.add((target_slug, idx))
            if app.get("cvKey") not in cv_keys:
                raise ValueError(f"Unknown cvKey {app.get('cvKey')} for {email}")
            if app.get("targetStage") not in STAGE_PATHS:
                raise ValueError(f"Invalid targetStage {app.get('targetStage')}")
    return payload


def detect_postgres_container() -> str:
    proc = subprocess.run(
        ["docker", "ps", "--filter", "status=running", "--format", "{{.Names}}\t{{.Image}}"],
        capture_output=True, text=True, check=True, timeout=15,
    )
    matches: list[str] = []
    for line in proc.stdout.splitlines():
        parts = line.strip().split("\t")
        if len(parts) != 2:
            continue
        name, image = parts
        if "postgres" not in image.lower():
            continue
        probe = subprocess.run(
            ["docker", "exec", name, "psql", "-U", "platform_admin", "-d", "auth_db", "-tAc", "SELECT 1"],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode == 0 and probe.stdout.strip() == "1":
            matches.append(name)
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected exactly 1 running postgres container with auth_db, found {len(matches)}: {matches}. "
            "Pass --postgres-container <container-name> explicitly."
        )
    return matches[0]


def bootstrap_accounts_via_postgres(
    container: str,
    accounts: list[tuple[str, str, str]],
    *,
    grant_admin_email: str | None = None,
) -> None:
    """Activate/provision seed accounts in auth_db via pgcrypto without triggering external SMTP."""
    statements = ["CREATE EXTENSION IF NOT EXISTS pgcrypto;"]
    for email, password, role_code in accounts:
        if role_code not in {"CANDIDATE", "RECRUITER", "SYSTEM_ADMIN"}:
            raise ValueError(f"Unsupported role {role_code}")
        email_b64 = base64.b64encode(email.strip().encode("utf-8")).decode("ascii")
        norm_b64 = base64.b64encode(email.strip().casefold().encode("utf-8")).decode("ascii")
        pwd_b64 = base64.b64encode(password.encode("utf-8")).decode("ascii")
        statements.append(f"""
DO $$
DECLARE
    v_email TEXT := convert_from(decode('{email_b64}', 'base64'), 'UTF8');
    v_norm  TEXT := convert_from(decode('{norm_b64}', 'base64'), 'UTF8');
    v_pwd   TEXT := convert_from(decode('{pwd_b64}', 'base64'), 'UTF8');
    v_uid   BIGINT;
    v_rid   BIGINT;
BEGIN
    SELECT id INTO v_uid FROM auth_users WHERE normalized_email = v_norm;
    IF v_uid IS NULL THEN
        INSERT INTO auth_users (email, normalized_email, status, email_verified_at, created_at, updated_at, version)
        VALUES (v_email, v_norm, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
        RETURNING id INTO v_uid;
    ELSE
        UPDATE auth_users
           SET status = 'ACTIVE',
               email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP),
               updated_at = GREATEST(updated_at, CURRENT_TIMESTAMP)
         WHERE id = v_uid AND status = 'PENDING';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM password_credentials WHERE user_id = v_uid) THEN
        INSERT INTO password_credentials (
            user_id, password_hash, hash_algorithm, password_changed_at, created_at, updated_at, version
        ) VALUES (
            v_uid, crypt(v_pwd, gen_salt('bf', 12)), 'BCRYPT',
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0
        );
    END IF;

    SELECT id INTO v_rid FROM roles WHERE code = '{role_code}';
    IF v_rid IS NULL THEN
        RAISE EXCEPTION 'Missing system role {role_code}';
    END IF;
    INSERT INTO user_roles (user_id, role_id, assigned_at)
    VALUES (v_uid, v_rid, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;
""")

    if grant_admin_email:
        grant_b64 = base64.b64encode(grant_admin_email.strip().casefold().encode("utf-8")).decode("ascii")
        statements.append(f"""
DO $$
DECLARE
    v_norm TEXT := convert_from(decode('{grant_b64}', 'base64'), 'UTF8');
    v_uid  BIGINT;
    v_rid  BIGINT;
BEGIN
    SELECT id INTO v_uid FROM auth_users WHERE normalized_email = v_norm AND status = 'ACTIVE';
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Active user not found for --grant-admin-email: %', v_norm;
    END IF;
    SELECT id INTO v_rid FROM roles WHERE code = 'SYSTEM_ADMIN';
    INSERT INTO user_roles (user_id, role_id, assigned_at)
    VALUES (v_uid, v_rid, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;
""")

    sql = "\n".join(statements)
    proc = subprocess.run(
        ["docker", "exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-q", "-U", "platform_admin", "-d", "auth_db"],
        input=sql, text=True, capture_output=True, timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"PostgreSQL account bootstrap failed in container {container}")
    print(f"  auth_db bootstrap complete via container '{container}' ({len(accounts)} accounts verified)")


def seed_categories(client: Any, admin_token: str, catalog_spec: dict[str, Any]) -> dict[tuple[str, str | None, str], str]:
    entries = client.json("GET", "/api/v2/dashboard/catalog", token=admin_token)
    lookup: dict[tuple[str, str | None, str], str] = {}
    for entry in entries:
        if entry.get("status") == "ACTIVE":
            parent = numeric_id(entry["parentId"]) if entry.get("parentId") is not None else None
            lookup[(entry["kind"], parent, _key(entry["name"]))] = numeric_id(entry["id"])

    def ensure_cat(kind: str, parent_id: str | None, name: str) -> str:
        k = (kind, parent_id, _key(name))
        if k in lookup:
            return lookup[k]
        created = client.json(
            "POST",
            "/api/v2/dashboard/catalog",
            token=admin_token,
            payload={
                "kind": kind,
                "parentId": parent_id,
                "name": name,
                "reason": "Khởi tạo danh mục ngành nghề chuẩn cho cổng tuyển dụng.",
            },
        )
        cid = numeric_id(created["id"])
        lookup[k] = cid
        return cid

    it_id = ensure_cat("INDUSTRY", None, "Công nghệ thông tin")
    created_count = 0
    before_size = len(lookup)
    for spec in catalog_spec.get("itExtraSpecializations", []):
        spec_id = ensure_cat("SPECIALIZATION", it_id, spec["name"])
        for pos in spec.get("positions", []):
            ensure_cat("POSITION", spec_id, pos)

    for ind in catalog_spec.get("nonItIndustries", []):
        ind_id = ensure_cat("INDUSTRY", None, ind["name"])
        for spec in ind.get("specializations", []):
            spec_id = ensure_cat("SPECIALIZATION", ind_id, spec["name"])
            for pos in spec.get("positions", []):
                ensure_cat("POSITION", spec_id, pos)

    created_count = len(lookup) - before_size
    print(f"  job categories ready: {len(lookup)} active nodes ({created_count} newly created)")
    return lookup


def seed_skills(client: Any, admin_token: str, extra_skills: list[dict[str, Any]]) -> int:
    state = client.json("GET", "/api/v2/taxonomy/skills", token=admin_token)
    version = int(state["version"])
    known_terms: set[str] = set()
    for skill in state.get("skills", []):
        if skill.get("status") in {"ACTIVE", "PENDING", "DEFERRED"}:
            known_terms.add(_key(skill["canonicalName"]))
            known_terms.add(_key(skill["normalizedName"]))
            for alias in skill.get("aliases", []):
                val = alias["value"] if isinstance(alias, dict) else str(alias)
                known_terms.add(_key(val))

    added = 0
    for item in extra_skills:
        if not item.get("approve", True):
            continue
        terms = [_key(item["name"]), *(_key(a) for a in item.get("aliases", []))]
        if any(t in known_terms for t in terms):
            continue
        resp = client.json(
            "POST",
            "/api/v2/taxonomy/skills",
            token=admin_token,
            payload={
                "version": version,
                "action": "CREATE",
                "name": item["name"],
                "type": item["type"],
                "category": item["category"],
                "aliases": item.get("aliases", []),
                "reason": "Mở rộng bộ từ điển kỹ năng CNTT phục vụ trích xuất và đối sánh hồ sơ.",
            },
        )
        version = int(resp["version"])
        known_terms.update(terms)
        added += 1
    print(f"  skill taxonomy ready: +{added} new canonical IT skills (catalog v{version})")
    return added


def resolve_category_choice(
    ref: dict[str, Any],
    cat_lookup: dict[tuple[str, str | None, str], str] | None,
) -> dict[str, Any]:
    if not cat_lookup:
        if ref["industry"] == "Công nghệ thông tin":
            return {"industryId": "1", "positionName": ref["position"]}
        return {
            "industryName": ref["industry"],
            "specializationName": ref["specialization"],
            "positionName": ref["position"],
        }
    ind_id = cat_lookup.get(("INDUSTRY", None, _key(ref["industry"])))
    if not ind_id:
        return {
            "industryName": ref["industry"],
            "specializationName": ref["specialization"],
            "positionName": ref["position"],
        }
    spec_id = cat_lookup.get(("SPECIALIZATION", ind_id, _key(ref["specialization"])))
    if not spec_id:
        return {
            "industryId": ind_id,
            "specializationName": ref["specialization"],
            "positionName": ref["position"],
        }
    if ref.get("proposePosition"):
        return {
            "industryId": ind_id,
            "specializationId": spec_id,
            "positionName": ref["position"],
        }
    pos_id = cat_lookup.get(("POSITION", spec_id, _key(ref["position"])))
    if pos_id:
        return {
            "industryId": ind_id,
            "specializationId": spec_id,
            "positionId": pos_id,
            "positionName": ref["position"],
        }
    return {
        "industryId": ind_id,
        "specializationId": spec_id,
        "positionName": ref["position"],
    }


def publish_manual_job(client: Any, token: str, job: dict[str, Any]) -> dict[str, Any]:
    if job["status"] == "PUBLISHED":
        return job
    current = client.json("GET", f"/api/v2/jobs/{job['jobId']}", token=token)
    if current["status"] == "PUBLISHED":
        return current
    return client.json("POST", f"/api/v2/jobs/{job['jobId']}/publish?version={current['version']}", token=token)


def seed_companies_and_jobs(
    client: Any,
    recruiter_token: str,
    admin_token: str | None,
    companies_spec: list[dict[str, Any]],
    cat_lookup: dict[tuple[str, str | None, str], str] | None,
    *,
    deadline_days: int = 90,
    draft_only: bool = False,
) -> dict[tuple[str, int], dict[str, Any]]:
    owned = client.json("GET", "/api/v2/companies", token=recruiter_token)
    by_slug = {item["slug"]: item for item in owned}
    deadline = (datetime.now(UTC) + timedelta(days=deadline_days)).isoformat()
    job_index_map: dict[tuple[str, int], dict[str, Any]] = {}
    published_total = 0
    draft_total = 0

    for group in companies_spec:
        spec = group["company"]
        slug = spec["slug"]
        company = by_slug.get(slug)
        if company is None:
            company = client.json("POST", "/api/v2/companies", token=recruiter_token, payload=spec)
            by_slug[slug] = company
        company_id = numeric_id(company["companyId"])

        if group["approve"] and admin_token and company.get("status") == "PENDING":
            company = client.json(
                "POST",
                f"/api/v2/dashboard/companies/{company_id}/approve",
                token=admin_token,
                payload={
                    "version": company["version"],
                    "reason": "Duyệt hồ sơ doanh nghiệp hoạt động trên cổng tuyển dụng.",
                },
            )
            by_slug[slug] = company

        jobs_path = f"/api/v2/companies/{company_id}/jobs"
        existing_jobs = client.json("GET", jobs_path, token=recruiter_token)
        by_title = {item["title"]: item for item in existing_jobs}

        for idx, job_spec in enumerate(group["jobs"]):
            job = by_title.get(job_spec["title"])
            if job is None:
                payload = {k: v for k, v in job_spec.items() if k != "categoryRef"}
                payload["category"] = resolve_category_choice(job_spec["categoryRef"], cat_lookup)
                payload["applicationDeadline"] = deadline
                payload["version"] = None
                job = client.json("POST", jobs_path, token=recruiter_token, payload=payload)
                by_title[job_spec["title"]] = job

            numeric_id(job["jobId"])
            numeric_id(job["jobVersionId"])

            should_publish = (not draft_only) and group["approve"] and company.get("status") == "ACTIVE"
            if should_publish and job["status"] != "PUBLISHED":
                if job.get("matchingSupported") is False:
                    job = publish_manual_job(client, recruiter_token, job)
                else:
                    job = demo.ensure_job_published(client, recruiter_token, job)

            if job["status"] == "PUBLISHED":
                published_total += 1
            else:
                draft_total += 1
            job_index_map[(slug, idx)] = job

        print(f"  company {slug} ({company.get('status')}): {len(group['jobs'])} jobs processed")

    print(f"  jobs summary: {published_total} PUBLISHED, {draft_total} DRAFT")
    return job_index_map


def ensure_candidate_cv(client: Any, token: str, cv_spec: dict[str, Any], existing_cvs: list[dict[str, Any]]) -> dict[str, Any]:
    cv = next((item for item in existing_cvs if item["title"] == cv_spec["title"]), None)
    if cv is None:
        pdf_bytes = render_cv_pdf(cv_spec["pdfContent"])
        cv = client.multipart_pdf("/api/v2/cvs", cv_spec["title"], cv_spec["filename"], pdf_bytes, token)
        existing_cvs.append(cv)
    version_id = numeric_id(cv["activeVersion"]["cvVersionId"])
    parsed = demo.wait_for(
        f"ParsedCV {version_id}",
        lambda: demo.get_or_none(client, f"/api/v2/parsed-cvs/{version_id}", token),
    )
    if parsed["status"] != "CONFIRMED":
        client.json(
            "POST",
            f"/api/v2/parsed-cvs/{version_id}/confirm",
            token=token,
            payload={"expectedRevisionId": parsed["revisionId"]},
        )

    def confirmed() -> dict[str, Any] | None:
        current = client.json("GET", f"/api/v2/cvs/{cv['cvId']}", token=token)
        return current if current["activeVersion"]["processingStatus"] == "CONFIRMED" else None

    return demo.wait_for(f"Core CV confirmation {version_id}", confirmed)


def advance_application_stage(
    client: Any,
    recruiter_token: str,
    application: dict[str, Any],
    target_stage: str,
    final_reason: str | None,
) -> dict[str, Any]:
    path = STAGE_PATHS[target_stage]
    if not path or application["status"] == target_stage:
        return application
    if application["status"] in {"HIRED", "REJECTED", "WITHDRAWN"}:
        return application

    start_idx = 0
    if application["status"] in path:
        start_idx = path.index(application["status"]) + 1

    current = application
    for step in path[start_idx:]:
        reason = (
            final_reason
            if step == target_stage and final_reason
            else f"Chuyển hồ sơ sang bước {step} sau đánh giá của bộ phận tuyển dụng."
        )
        current = client.json(
            "PATCH",
            f"/api/v2/recruiter/applications/{current['applicationId']}/status",
            token=recruiter_token,
            payload={"status": step, "reason": reason, "version": current["version"]},
        )
    return current


def seed_candidates_and_applications(
    client: Any,
    candidate_tokens: dict[str, str],
    recruiter_token: str,
    candidates_spec: list[dict[str, Any]],
    job_index_map: dict[tuple[str, int], dict[str, Any]],
) -> dict[str, int]:
    stats = {"profiles": 0, "cvs": 0, "drafts": 0, "applications": 0}
    for cand in candidates_spec:
        email = cand["email"].casefold()
        token = candidate_tokens[email]

        existing_profile = demo.get_or_none(client, "/api/v2/candidates/me", token)
        profile_payload = dict(cand["profile"])
        profile_payload["version"] = existing_profile["version"] if existing_profile else None
        client.json("PUT", "/api/v2/candidates/me", token=token, payload=profile_payload)
        stats["profiles"] += 1

        existing_cvs = client.json("GET", "/api/v2/cvs", token=token)
        cv_by_key: dict[str, dict[str, Any]] = {}
        for cv_spec in cand["cvs"]:
            cv_by_key[cv_spec["key"]] = ensure_candidate_cv(client, token, cv_spec, existing_cvs)
            stats["cvs"] += 1

        if cand.get("drafts"):
            existing_drafts = client.json("GET", "/api/v2/cvs/drafts", token=token)
            draft_titles = {d["title"] for d in existing_drafts}
            for draft_spec in cand["drafts"]:
                if draft_spec["title"] not in draft_titles:
                    client.json("POST", "/api/v2/cvs/drafts", token=token, payload=draft_spec)
                stats["drafts"] += 1

        existing_apps = client.json("GET", "/api/v2/candidate/applications", token=token)
        apps_by_job = {str(item["jobId"]): item for item in existing_apps}

        for app_spec in cand.get("applications", []):
            job = job_index_map.get((app_spec["companySlug"], app_spec["jobIndex"]))
            if not job or job.get("status") != "PUBLISHED":
                continue
            job_id = str(job["jobId"])
            app = apps_by_job.get(job_id)
            if app is None:
                cv = cv_by_key[app_spec["cvKey"]]
                idem = f"showcase-{uuid5(SHOWCASE_NAMESPACE, f'{email}:{job_id}')}"
                app = client.json(
                    "POST",
                    "/api/v2/candidate/applications",
                    token=token,
                    headers={"Idempotency-Key": idem},
                    payload={
                        "jobId": job_id,
                        "cvId": str(cv["cvId"]),
                        "cvVersionId": str(cv["activeVersion"]["cvVersionId"]),
                        "coverLetter": app_spec.get("coverLetter"),
                        "consentAccepted": True,
                        "policyVersion": "showcase-cv-sharing-v1",
                    },
                )
                apps_by_job[job_id] = app

            if job.get("matchingSupported") is not False:
                demo.wait_for(
                    f"matching result {app['applicationId']}",
                    lambda aid=app["applicationId"]: demo.get_or_none(
                        client, f"/api/v2/applications/{aid}/match", recruiter_token
                    ),
                )

            advance_application_stage(
                client,
                recruiter_token,
                app,
                app_spec["targetStage"],
                app_spec.get("stageReason"),
            )
            stats["applications"] += 1

        print(f"  candidate {email}: {len(cand['cvs'])} CVs, {len(cand.get('applications', []))} applications ready")
    return stats


def upload_optional_local_cv_dir(
    client: Any,
    cv_dir: Path,
    max_files: int,
    token: str,
) -> int:
    if not cv_dir.is_dir():
        raise ValueError(f"--cv-dir does not exist: {cv_dir}")
    files = sorted(p for p in cv_dir.glob("*.pdf") if p.is_file() and p.stat().st_size <= 8 * 1024 * 1024)[:max_files]
    existing_cvs = client.json("GET", "/api/v2/cvs", token=token)
    existing_titles = {item["title"] for item in existing_cvs}
    uploaded = 0
    for idx, pdf_path in enumerate(files, start=1):
        safe_title = f"Local QA Sample CV #{idx:02d}"
        if safe_title in existing_titles:
            continue
        cv = client.multipart_pdf("/api/v2/cvs", safe_title, f"local-qa-cv-{idx:02d}.pdf", pdf_path.read_bytes(), token)
        version_id = numeric_id(cv["activeVersion"]["cvVersionId"])
        parsed = demo.wait_for(
            f"ParsedCV {version_id}",
            lambda vid=version_id: demo.get_or_none(client, f"/api/v2/parsed-cvs/{vid}", token),
        )
        if parsed["status"] != "CONFIRMED":
            client.json(
                "POST",
                f"/api/v2/parsed-cvs/{version_id}/confirm",
                token=token,
                payload={"expectedRevisionId": parsed["revisionId"]},
            )
        uploaded += 1
    print(f"  local --cv-dir import: {uploaded} PDFs uploaded with anonymized titles (externalAiConsent=False)")
    return uploaded


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument(
        "--gateway-url",
        type=gateway_origin,
        default=os.getenv("GATEWAY_URL", "http://127.0.0.1:8080"),
        help="Loopback Gateway/Web origin (use http://127.0.0.1:5173 on Coolify Ubuntu host) or https:// domain",
    )
    parser.add_argument("--mailpit-url", default=os.getenv("MAILPIT_URL", "http://127.0.0.1:8025"))
    parser.add_argument("--postgres-container", help="Name of PostgreSQL container to bootstrap accounts without SMTP")
    parser.add_argument("--auto-postgres", action="store_true", help="Auto-detect the running PostgreSQL container with auth_db")
    parser.add_argument("--grant-admin-email", help="Optional existing active account email to grant SYSTEM_ADMIN")
    parser.add_argument("--skip-admin", action="store_true", help="Skip admin-only catalog/company approval steps")
    parser.add_argument("--admin-email", default=os.getenv("SHOWCASE_ADMIN_EMAIL", "quantri@smart.local"))
    parser.add_argument("--recruiter-email", default=os.getenv("SHOWCASE_RECRUITER_EMAIL", "tuyendung@smart.local"))
    parser.add_argument("--admin-password-env", default="SHOWCASE_ADMIN_PASSWORD")
    parser.add_argument("--recruiter-password-env", default="SHOWCASE_RECRUITER_PASSWORD")
    parser.add_argument("--candidate-password-env", default="SHOWCASE_CANDIDATE_PASSWORD")
    parser.add_argument("--deadline-days", type=int, choices=range(1, 366), metavar="1..365", default=90)
    parser.add_argument("--draft-only", action="store_true", help="Create company/job drafts without publishing or applying")
    parser.add_argument("--cv-dir", type=Path, help="Local-only QA option: upload up to --max-external-cvs PDFs from folder")
    parser.add_argument("--max-external-cvs", type=int, default=5)
    parser.add_argument("--dry-run", action="store_true", help="Offline fixture validation and summary; zero network/DB calls")
    return parser


def _resolve_password(env_name: str, default_value: str | None, prompt_label: str) -> str:
    if env_name and os.environ.get(env_name):
        return os.environ[env_name]
    if default_value is not None:
        return default_value
    value = getpass.getpass(f"{prompt_label}: ")
    if not value:
        raise ValueError(f"{prompt_label} is required")
    return value


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        fixture = load_showcase_fixture(args.data)
        companies = fixture["companies"]
        candidates = fixture["candidates"]
        total_jobs = sum(len(g["jobs"]) for g in companies)
        total_cvs = sum(len(c["cvs"]) for c in candidates)
        total_apps = sum(len(c.get("applications", [])) for c in candidates)

        if args.dry_run:
            print(
                f"Valid showcase seed: {len(companies)} companies "
                f"({sum(1 for g in companies if g['approve'])} active + {sum(1 for g in companies if not g['approve'])} pending), "
                f"{total_jobs} jobs, {len(fixture['catalog']['extraSkills'])} extra IT skills, "
                f"{len(candidates)} candidates, {total_cvs} PDF CVs, {total_apps} Kanban applications."
            )
            return 0

        admin_pwd = _resolve_password(args.admin_password_env, os.getenv("DEMO_ADMIN_PASSWORD", "SmartAdmin!2026"), "Admin password")
        recruiter_pwd = _resolve_password(args.recruiter_password_env, os.getenv("DEMO_RECRUITER_PASSWORD", "SmartRecruiter!2026"), "Recruiter password")
        candidate_pwd = _resolve_password(args.candidate_password_env, os.getenv("DEMO_CANDIDATE_PASSWORD", "SmartCandidate!2026"), "Candidate password")

        pg_container = args.postgres_container or (detect_postgres_container() if args.auto_postgres else None)
        if pg_container:
            bootstrap_list: list[tuple[str, str, str]] = [
                (args.recruiter_email, recruiter_pwd, "RECRUITER"),
                *((cand["email"], candidate_pwd, "CANDIDATE") for cand in candidates),
            ]
            if not args.skip_admin:
                bootstrap_list.insert(0, (args.admin_email, admin_pwd, "SYSTEM_ADMIN"))
            bootstrap_accounts_via_postgres(pg_container, bootstrap_list, grant_admin_email=args.grant_admin_email)

        client = demo.HttpClient(args.gateway_url, args.mailpit_url)

        admin_token: str | None = None
        cat_lookup: dict[tuple[str, str | None, str], str] | None = None
        if not args.skip_admin:
            admin_session = demo.login(client, args.admin_email, admin_pwd)
            if "SYSTEM_ADMIN" not in admin_session.get("roles", []):
                raise ValueError(f"Account {args.admin_email} does not hold SYSTEM_ADMIN role")
            admin_token = admin_session["accessToken"]
            cat_lookup = seed_categories(client, admin_token, fixture["catalog"])
            seed_skills(client, admin_token, fixture["catalog"]["extraSkills"])

        recruiter_session = (
            demo.login(client, args.recruiter_email, recruiter_pwd)
            if pg_container
            else demo.ensure_account(client, args.recruiter_email, recruiter_pwd, "RECRUITER")
        )
        recruiter_token = recruiter_session["accessToken"]
        if demo.get_or_none(client, "/api/v2/recruiter/profile", recruiter_token) is None:
            client.json(
                "PUT",
                "/api/v2/recruiter/profile",
                token=recruiter_token,
                payload={
                    "displayName": "Ban Tuyển dụng Doanh nghiệp",
                    "businessTitle": "Head of Talent Acquisition",
                    "businessPhone": "+84900000099",
                    "version": None,
                },
            )

        job_index_map = seed_companies_and_jobs(
            client,
            recruiter_token,
            admin_token,
            companies,
            cat_lookup,
            deadline_days=args.deadline_days,
            draft_only=args.draft_only,
        )

        if not args.draft_only:
            candidate_tokens: dict[str, str] = {}
            for cand in candidates:
                email = cand["email"].casefold()
                if pg_container:
                    sess = demo.login(client, email, candidate_pwd)
                elif email.endswith(".local"):
                    sess = demo.ensure_account(client, email, candidate_pwd, "CANDIDATE")
                else:
                    try:
                        sess = demo.login(client, email, candidate_pwd)
                    except demo.ApiFailure as error:
                        if error.status == 401:
                            raise RuntimeError(
                                f"External email {email} requires --auto-postgres / --postgres-container "
                                "or an existing verified account with matching password"
                            ) from error
                        raise
                candidate_tokens[email] = sess["accessToken"]

            stats = seed_candidates_and_applications(
                client, candidate_tokens, recruiter_token, candidates, job_index_map
            )
            if args.cv_dir:
                primary_token = candidate_tokens[candidates[0]["email"].casefold()]
                upload_optional_local_cv_dir(client, args.cv_dir, max(1, min(args.max_external_cvs, 30)), primary_token)
            print(
                f"Showcase ready: {len(companies)} companies, {total_jobs} jobs, "
                f"{stats['cvs']} CVs, {stats['drafts']} drafts, {stats['applications']} applications."
            )
        else:
            print(f"Showcase drafts ready: {len(companies)} companies, {total_jobs} draft jobs.")
        return 0
    except demo.ApiFailure as error:
        print(
            f"Showcase seed stopped: API HTTP {error.status}. Existing rows are preserved; rerun to resume.",
            file=sys.stderr,
        )
    except (ValueError, KeyError, OSError, RuntimeError, TimeoutError, subprocess.SubprocessError) as error:
        msg = str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__
        print(f"Showcase seed stopped: {msg}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    raise SystemExit(main())
