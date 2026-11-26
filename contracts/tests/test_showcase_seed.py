"""Offline regression tests for the Coolify-ready showcase dataset and seeder."""
from __future__ import annotations

from copy import deepcopy
import importlib.util
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("showcase_seed", ROOT / "scripts/seed-showcase.py")
assert SPEC and SPEC.loader
showcase = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(showcase)
FIXTURE = ROOT / "scripts/seed-showcase-data.json"


class FakeShowcaseApi:
    def __init__(self) -> None:
        self.counter = 9007199254740993
        self.catalog = [
            {"id": "1", "kind": "INDUSTRY", "parentId": None, "name": "Công nghệ thông tin", "status": "ACTIVE", "version": 0},
            {"id": "2", "kind": "SPECIALIZATION", "parentId": "1", "name": "Phát triển phần mềm", "status": "ACTIVE", "version": 0},
            {"id": "3", "kind": "SPECIALIZATION", "parentId": "1", "name": "Dữ liệu & AI", "status": "ACTIVE", "version": 0},
            {"id": "4", "kind": "SPECIALIZATION", "parentId": "1", "name": "An toàn thông tin", "status": "ACTIVE", "version": 0},
            {"id": "5", "kind": "SPECIALIZATION", "parentId": "1", "name": "Hạ tầng & mạng", "status": "ACTIVE", "version": 0},
            {"id": "6", "kind": "POSITION", "parentId": "2", "name": "Backend Developer", "status": "ACTIVE", "version": 0},
        ]
        self.skill_version = 0
        self.skills = [
            {"stableId": "1", "canonicalName": "Java", "normalizedName": "java", "aliases": [], "status": "ACTIVE"},
        ]
        self.companies: list[dict] = []
        self.jobs: dict[str, list[dict]] = {}
        self.parsed_jds: dict[str, dict] = {}
        self.candidate_profiles: dict[str, dict] = {}
        self.cvs: dict[str, list[dict]] = {}
        self.parsed_cvs: dict[str, dict] = {}
        self.drafts: dict[str, list[dict]] = {}
        self.applications: list[dict] = []

    def next_id(self) -> str:
        self.counter += 1
        return str(self.counter)

    def multipart_pdf(self, path: str, title: str, filename: str, content: bytes, token: str) -> dict:
        assert path == "/api/v2/cvs"
        assert content.startswith(b"%PDF-1.4")
        assert filename.endswith(".pdf")
        cv_id = self.next_id()
        ver_id = self.next_id()
        rev_id = self.next_id()
        item = {
            "cvId": cv_id,
            "title": title,
            "activeVersion": {"cvVersionId": ver_id, "processingStatus": "PARSED"},
        }
        self.cvs.setdefault(token, []).append(item)
        self.parsed_cvs[ver_id] = {"revisionId": rev_id, "status": "PARSED", "cvId": cv_id, "token": token}
        return deepcopy(item)

    def json(self, method: str, path: str, *, payload=None, token: str | None = None, headers=None, mailpit: bool = False):
        assert not mailpit
        assert path.startswith("/api/v2/")

        if path == "/api/v2/dashboard/catalog":
            assert token == "admin-token"
            if method == "GET":
                return deepcopy(self.catalog)
            assert method == "POST"
            assert payload["parentId"] is None or isinstance(payload["parentId"], str)
            entry = {
                "id": self.next_id(),
                "kind": payload["kind"],
                "parentId": payload["parentId"],
                "name": payload["name"],
                "status": "ACTIVE",
                "version": 0,
            }
            self.catalog.append(entry)
            return deepcopy(entry)

        if path == "/api/v2/taxonomy/skills":
            assert token == "admin-token"
            if method == "GET":
                return {"version": self.skill_version, "taxonomyVersion": f"1.0.{self.skill_version}", "skills": deepcopy(self.skills)}
            assert method == "POST" and payload["version"] == self.skill_version and payload["action"] == "CREATE"
            self.skill_version += 1
            entry = {
                "stableId": self.next_id(),
                "canonicalName": payload["name"],
                "normalizedName": payload["name"].casefold(),
                "aliases": [{"value": a} for a in payload.get("aliases", [])],
                "status": "ACTIVE",
            }
            self.skills.append(entry)
            return {"version": self.skill_version, "taxonomyVersion": f"1.0.{self.skill_version}", "skill": deepcopy(entry)}

        if path == "/api/v2/companies":
            assert token == "recruiter-token"
            if method == "GET":
                return deepcopy(self.companies)
            assert method == "POST"
            item = {**payload, "companyId": self.next_id(), "status": "PENDING", "version": 0}
            self.companies.append(item)
            return deepcopy(item)

        match = re.fullmatch(r"/api/v2/dashboard/companies/(\d+)/approve", path)
        if match:
            assert token == "admin-token" and method == "POST"
            comp = next(c for c in self.companies if c["companyId"] == match.group(1))
            assert payload["version"] == comp["version"]
            comp["status"] = "ACTIVE"
            comp["version"] += 1
            return deepcopy(comp)

        match = re.fullmatch(r"/api/v2/companies/(\d+)/jobs", path)
        if match:
            assert token == "recruiter-token"
            items = self.jobs.setdefault(match.group(1), [])
            if method == "GET":
                return deepcopy(items)
            assert method == "POST"
            cat = payload["category"]
            for id_field in ("industryId", "specializationId", "positionId"):
                if id_field in cat and cat[id_field] is not None:
                    assert isinstance(cat[id_field], str)
            is_it = cat.get("industryId") == "1"
            job = {
                **payload,
                "jobId": self.next_id(),
                "jobVersionId": self.next_id(),
                "status": "DRAFT",
                "matchingSupported": is_it,
                "version": 0,
            }
            items.append(job)
            if is_it:
                self.parsed_jds[job["jobVersionId"]] = {"revisionId": self.next_id(), "status": "PARSED"}
            return deepcopy(job)

        match = re.fullmatch(r"/api/v2/parsed-jds/(\d+)(/confirm)?", path)
        if match:
            rev = self.parsed_jds[match.group(1)]
            if match.group(2):
                assert method == "POST" and payload == {"expectedRevisionId": rev["revisionId"]}
                rev["status"] = "CONFIRMED"
            return deepcopy(rev)

        match = re.fullmatch(r"/api/v2/jobs/(\d+)(/publish\?version=(\d+))?", path)
        if match:
            job = next(j for group in self.jobs.values() for j in group if j["jobId"] == match.group(1))
            if match.group(2):
                comp_id = next(cid for cid, group in self.jobs.items() if any(j["jobId"] == job["jobId"] for j in group))
                comp = next(c for c in self.companies if c["companyId"] == comp_id)
                assert comp["status"] == "ACTIVE"
                if job["matchingSupported"]:
                    assert self.parsed_jds[job["jobVersionId"]]["status"] == "CONFIRMED"
                job["status"] = "PUBLISHED"
                job["version"] += 1
            return deepcopy(job)

        if path == "/api/v2/candidates/me":
            if method == "GET":
                if token not in self.candidate_profiles:
                    raise showcase.demo.ApiFailure(404, {"message": "Not found"}, "GET", path)
                return deepcopy(self.candidate_profiles[token])
            assert method == "PUT"
            prof = {**payload, "candidateProfileId": self.next_id(), "version": (payload.get("version") or 0) + 1}
            self.candidate_profiles[token] = prof
            return deepcopy(prof)

        if path == "/api/v2/cvs":
            assert method == "GET"
            return deepcopy(self.cvs.get(token, []))

        match = re.fullmatch(r"/api/v2/cvs/(\d+)", path)
        if match:
            cv = next(c for items in self.cvs.values() for c in items if c["cvId"] == match.group(1))
            return deepcopy(cv)

        match = re.fullmatch(r"/api/v2/parsed-cvs/(\d+)(/confirm)?", path)
        if match:
            rev = self.parsed_cvs[match.group(1)]
            if match.group(2):
                assert method == "POST" and payload == {"expectedRevisionId": rev["revisionId"]}
                rev["status"] = "CONFIRMED"
                cv = next(c for c in self.cvs[rev["token"]] if c["cvId"] == rev["cvId"])
                cv["activeVersion"]["processingStatus"] = "CONFIRMED"
            return deepcopy(rev)

        if path == "/api/v2/cvs/drafts":
            items = self.drafts.setdefault(token, [])
            if method == "GET":
                return deepcopy(items)
            assert method == "POST"
            draft = {**payload, "draftId": self.next_id(), "version": 0}
            items.append(draft)
            return deepcopy(draft)

        if path == "/api/v2/candidate/applications":
            if method == "GET":
                return deepcopy([a for a in self.applications if a["_owner"] == token])
            assert method == "POST" and headers and headers.get("Idempotency-Key")
            app = {
                "applicationId": self.next_id(),
                "jobId": payload["jobId"],
                "status": "SUBMITTED",
                "version": 0,
                "_owner": token,
            }
            self.applications.append(app)
            return deepcopy(app)

        match = re.fullmatch(r"/api/v2/applications/(\d+)/match", path)
        if match:
            return {"status": "COMPLETED", "finalScore": 84.5, "algorithmVersion": "baseline-v7", "taxonomyVersion": "1.0.42"}

        match = re.fullmatch(r"/api/v2/recruiter/applications/(\d+)/status", path)
        if match:
            assert token == "recruiter-token" and method == "PATCH"
            app = next(a for a in self.applications if a["applicationId"] == match.group(1))
            assert payload["version"] == app["version"]
            app["status"] = payload["status"]
            app["version"] += 1
            return deepcopy(app)

        raise AssertionError(f"Unexpected API call: {method} {path}")


def test_showcase_fixture_has_realistic_content_assets_and_no_demo_clutter():
    assert "demo" not in FIXTURE.read_text(encoding="utf-8").lower()
    fixture = showcase.load_showcase_fixture(FIXTURE)
    assert len(fixture["companies"]) == 21
    assert sum(1 for g in fixture["companies"] if g["approve"]) == 20
    assert sum(1 for g in fixture["companies"] if not g["approve"]) == 1
    total_jobs = sum(len(g["jobs"]) for g in fixture["companies"])
    assert total_jobs >= 50
    banned = ("(demo)", "tin demo", "dữ liệu demo", "chưa được thu thập")
    for group in fixture["companies"]:
        comp = group["company"]
        for field in ("legalName", "displayName", "description"):
            assert not any(b in comp[field].casefold() for b in banned)
        for job in group["jobs"]:
            for field in ("title", "description", "requirementsText"):
                assert not any(b in job[field].casefold() for b in banned)
            assert job["province"] in {"Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Bình Dương", "Cần Thơ"}


def test_showcase_dry_run_is_offline_and_accepts_loopback_or_https(monkeypatch, capsys):
    def forbidden(*args, **kwargs):
        raise AssertionError("Dry-run must not open network or subprocesses")

    monkeypatch.setattr(showcase.demo, "HttpClient", forbidden)
    monkeypatch.setattr(showcase.subprocess, "run", forbidden)
    assert showcase.main(["--dry-run", "--gateway-url", "http://127.0.0.1:5173"]) == 0
    assert "21 companies" in capsys.readouterr().out
    assert showcase.main(["--dry-run", "--gateway-url", "https://jobs.example.com"]) == 0


@pytest.mark.parametrize("bad_url", ["http://jobs.example.com", "http://127.0.0.1:5173/api/v2", "https://user:pass@jobs.example.com"])
def test_showcase_rejects_insecure_remote_http_or_path_origins(bad_url):
    with pytest.raises(SystemExit) as exc:
        showcase.main(["--dry-run", "--gateway-url", bad_url])
    assert exc.value.code == 2


def test_showcase_end_to_end_pipeline_is_repeatable_and_populates_all_kanban_stages():
    fixture = showcase.load_showcase_fixture(FIXTURE)
    api = FakeShowcaseApi()

    cat_lookup = showcase.seed_categories(api, "admin-token", fixture["catalog"])
    added_skills = showcase.seed_skills(api, "admin-token", fixture["catalog"]["extraSkills"])
    assert added_skills == len(fixture["catalog"]["extraSkills"])

    job_map = showcase.seed_companies_and_jobs(api, "recruiter-token", "admin-token", fixture["companies"], cat_lookup)
    cand_tokens = {c["email"].casefold(): f"cand-{idx}" for idx, c in enumerate(fixture["candidates"])}
    stats = showcase.seed_candidates_and_applications(api, cand_tokens, "recruiter-token", fixture["candidates"], job_map)

    assert len(api.companies) == 21
    assert sum(1 for c in api.companies if c["status"] == "ACTIVE") == 20
    assert sum(1 for c in api.companies if c["status"] == "PENDING") == 1
    assert stats["applications"] == 22
    observed_stages = {app["status"] for app in api.applications}
    assert observed_stages == {"SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "OFFERED", "HIRED", "REJECTED"}

    # Re-run to verify idempotency (zero duplicate companies, jobs, CVs, drafts, or applications)
    snapshot_counts = (
        len(api.catalog),
        len(api.skills),
        len(api.companies),
        sum(len(v) for v in api.jobs.values()),
        sum(len(v) for v in api.cvs.values()),
        sum(len(v) for v in api.drafts.values()),
        len(api.applications),
    )
    cat_lookup_2 = showcase.seed_categories(api, "admin-token", fixture["catalog"])
    assert showcase.seed_skills(api, "admin-token", fixture["catalog"]["extraSkills"]) == 0
    job_map_2 = showcase.seed_companies_and_jobs(api, "recruiter-token", "admin-token", fixture["companies"], cat_lookup_2)
    showcase.seed_candidates_and_applications(api, cand_tokens, "recruiter-token", fixture["candidates"], job_map_2)
    after_counts = (
        len(api.catalog),
        len(api.skills),
        len(api.companies),
        sum(len(v) for v in api.jobs.values()),
        sum(len(v) for v in api.cvs.values()),
        sum(len(v) for v in api.drafts.values()),
        len(api.applications),
    )
    assert after_counts == snapshot_counts
