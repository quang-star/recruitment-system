"""Prepare blind skill/career annotation kits; report readiness, never accuracy."""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

from app.shared.extraction_privacy import redact_contacts
from app.evaluation.validation import digest

PROTOCOL = "suggestions-annotation-v1"
LABEL_FILES = ("rater-1.json", "rater-2.json", "adjudication.json")
TASKS = {"SKILL", "CAREER"}
SPLITS = {"dev", "validation", "test"}
SOURCE_TYPES = {"SYNTHETIC_FIXTURE", "SYNTHETIC_HUMAN", "SYNTHETIC_LLM", "CONSENTED_REAL", "PUBLIC_LICENSED"}


def _hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def _read(path: Path) -> object:
    if path.suffix.lower() != ".json" or path.name.startswith(".env") or any(part.lower() in {"secrets", ".aws"} for part in path.parts):
        raise ValueError("Use an explicit research JSON artifact")
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("Use a bounded research JSON artifact")
    return json.loads(path.read_text(encoding="utf-8"))


def _identifier(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", value) is not None


def _safe_text(value: object, limit: int, *, blank: bool = False) -> bool:
    if not isinstance(value, str) or len(value) > limit or not blank and not value.strip():
        return False
    normalized = unicodedata.normalize("NFKC", value)
    return "█" not in value and redact_contacts(value) == value and redact_contacts(normalized) == normalized


def validate_manifest(value: object, *, sealed: bool = False) -> dict:
    if not isinstance(value, dict) or value.get("protocol") != PROTOCOL:
        raise ValueError("Unknown suggestion annotation protocol")
    if set(value) - {"protocol", "dataset_id", "rubric_version", "seed", "blind_review_confirmed",
                     "protocol_review_confirmed", "raters", "cases", "catalogs", "source_file_sha256"}:
        raise ValueError("Keep model outputs outside the blind manifest")
    if not _identifier(value.get("dataset_id")) or not _identifier(value.get("rubric_version")):
        raise ValueError("Use opaque dataset and rubric identifiers")
    if type(value.get("seed")) is not int or value["seed"] < 0:
        raise ValueError("Declare a nonnegative integer seed")
    if sealed and (not isinstance(value.get("source_file_sha256"), str) or re.fullmatch(r"[a-f0-9]{64}", value["source_file_sha256"]) is None):
        raise ValueError("Source manifest provenance is missing")
    if type(value.get("blind_review_confirmed")) is not bool or type(value.get("protocol_review_confirmed")) is not bool:
        raise ValueError("Declare human review flags explicitly")
    raters = value.get("raters")
    if not isinstance(raters, dict) or set(raters) != {"first", "second", "adjudicator"}:
        raise ValueError("Declare two independent raters and an adjudicator")
    if any(item is not None and not _identifier(item) for item in raters.values()):
        raise ValueError("Use pseudonymous rater identifiers")
    identities = [item for item in raters.values() if item is not None]
    if len(set(identities)) != len(identities):
        raise ValueError("Rater and adjudicator identities must be distinct")
    cases = value.get("cases")
    if not isinstance(cases, list) or not 1 <= len(cases) <= 5000:
        raise ValueError("Declare 1–5000 bounded cases")
    seen_ids, seen_inputs = set(), set()
    groups: dict[str, str] = {}
    for case in cases:
        if not isinstance(case, dict) or not _identifier(case.get("case_id")) or not _identifier(case.get("group_id")):
            raise ValueError("Use opaque case and source-group identifiers")
        if set(case) - {"case_id", "group_id", "task", "split", "source_type", "source_reference",
                        "rights_reference", "privacy_reviewed", "input", "input_sha256", "language", "slice"}:
            raise ValueError("Keep labels and predictions outside blind cases")
        if case.get("language") not in {None, "vi", "en", "mixed", "other"} or case.get("slice") is not None and not _identifier(case["slice"]):
            raise ValueError("Use declared language and opaque error-slice metadata")
        if case["case_id"] in seen_ids or case.get("task") not in TASKS or case.get("split") not in SPLITS:
            raise ValueError("Invalid or duplicate case metadata")
        seen_ids.add(case["case_id"])
        if groups.setdefault(case["group_id"], case["split"]) != case["split"]:
            raise ValueError("Source groups must not cross splits")
        if case.get("source_type") not in SOURCE_TYPES or type(case.get("privacy_reviewed")) is not bool:
            raise ValueError("Declare source type and human privacy review")
        for field in ("source_reference", "rights_reference"):
            if case.get(field) is not None and not _safe_text(case[field], 1000):
                raise ValueError("Use a safe provenance reference, not contact details")
        inputs = case.get("input")
        fields = {"term": 240} if case["task"] == "SKILL" else {"title": 240, "description": 30000, "requirementsText": 30000}
        if not isinstance(inputs, dict) or set(inputs) != set(fields):
            raise ValueError("Case inputs must match the selected task")
        if any(not _safe_text(inputs[key], limit, blank=key in {"description", "requirementsText"}) for key, limit in fields.items()):
            raise ValueError("Case input is blank, unbounded or contains detectable private details")
        digest = _hash(inputs)
        identity = (case["task"], digest)
        if identity in seen_inputs:
            raise ValueError("Duplicate model inputs must not be counted twice")
        seen_inputs.add(identity)
        if (sealed or case.get("input_sha256") is not None) and case.get("input_sha256") != digest:
            raise ValueError("Case input changed after the kit was prepared")
    catalogs = value.get("catalogs")
    if not isinstance(catalogs, dict) or not {case["task"] for case in cases}.issubset(catalogs) or set(catalogs) - TASKS:
        raise ValueError("Declare frozen catalogs for the evaluated tasks")
    for task, catalog in catalogs.items():
        if not isinstance(catalog, dict) or catalog.get("version") is not None and not _safe_text(catalog["version"], 160):
            raise ValueError("Invalid catalog metadata")
        if set(catalog) - {"version", "snapshot", "snapshot_sha256"}:
            raise ValueError("Unexpected catalog provenance fields")
        payload = catalog.get("snapshot")
        if payload is not None and not isinstance(payload, (dict, list)):
            raise ValueError("Catalog snapshot must be structured JSON")
        if payload is not None:
            _catalog_entries(task, payload)
        if sealed and catalog.get("snapshot_sha256") != (_hash(payload) if payload is not None else None):
            raise ValueError("Catalog snapshot changed after the kit was prepared")
    return value


def _catalog_entries(task: str, payload: dict | list) -> dict:
    if task == "SKILL":
        skills = payload.get("skills") if isinstance(payload, dict) else None
        if not isinstance(skills, list) or len(skills) > 1000 or any(not isinstance(item, dict)
            or not _identifier(item.get("stableId")) or not _safe_text(item.get("canonicalName"), 240)
            or item.get("status", "PUBLISHED") not in {"ACTIVE", "PUBLISHED"} for item in skills):
            raise ValueError("Freeze only the bounded published skill catalog")
        if len({item["stableId"] for item in skills}) != len(skills):
            raise ValueError("Duplicate canonical skill identities")
        for skill in skills:
            aliases = skill.get("aliases", [])
            if not isinstance(aliases, list) or any(not isinstance(alias, dict) or not _safe_text(alias.get("value"), 240)
                or alias.get("normalized") is not None and not _safe_text(alias["normalized"], 240) for alias in aliases):
                raise ValueError("Skill aliases contain invalid or detectable private labels")
        return {item["stableId"]: item for item in skills}
    from pydantic import TypeAdapter
    from app.career.catalog_reader import CategoryEntry, usable_catalog
    entries = TypeAdapter(list[CategoryEntry]).validate_python(payload)
    if len(entries) > 1000 or len({entry.id for entry in entries}) != len(entries) or len(usable_catalog(entries)) != len(entries):
        raise ValueError("Freeze only a bounded ACTIVE career hierarchy with safe labels")
    return {str(entry.id): entry for entry in entries}


def prepare(source: Path, output: Path) -> dict:
    manifest = deepcopy(validate_manifest(_read(source)))
    if output.exists():
        raise FileExistsError("Do not overwrite an annotation kit")
    for case in manifest["cases"]:
        case["input_sha256"] = _hash(case["input"])
    for catalog in manifest["catalogs"].values():
        catalog["snapshot_sha256"] = _hash(catalog["snapshot"]) if catalog.get("snapshot") is not None else None
    manifest["source_file_sha256"] = digest(source)
    output.mkdir(parents=True, exist_ok=False)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    rows = [{"case_id": case["case_id"], "decision": None, "acceptable_answers": [], "reason": ""} for case in manifest["cases"]]
    for name in LABEL_FILES:
        (output / name).write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return status(output)


def _complete(row: dict, task: str, catalog: dict | None) -> bool:
    if not _safe_text(row.get("reason"), 2000):
        return False
    answers = row.get("acceptable_answers")
    if not isinstance(answers, list) or len(answers) > 20 or len({_hash(answer) for answer in answers}) != len(answers):
        return False
    if task == "SKILL":
        if row.get("decision") == "MERGE":
            return bool(answers) and catalog is not None and all(_identifier(answer) and answer in catalog for answer in answers)
        return row.get("decision") in {"CREATE", "REJECT", "UNKNOWN"} and not answers
    if row.get("decision") in {"INSUFFICIENT_INFORMATION", "OUTSIDE_SCOPE"}:
        return not answers
    if row.get("decision") != "CLASSIFY" or not answers:
        return False
    from app.career.models import CategoryChoice
    for answer in answers:
        try:
            path = CategoryChoice.model_validate(answer)
        except ValueError:
            return False
        if any(not _safe_text(getattr(path, f"{key}Name"), 160) for key in ("industry", "specialization", "position")):
            return False
        if path.industryId is None and (path.specializationId is not None or path.positionId is not None) or path.specializationId is None and path.positionId is not None:
            return False
        parent = None
        for key, kind in (("industry", "INDUSTRY"), ("specialization", "SPECIALIZATION"), ("position", "POSITION")):
            identifier = getattr(path, f"{key}Id")
            if identifier is not None:
                entry = catalog.get(str(identifier)) if catalog is not None else None
                if entry is None or entry.kind != kind or entry.parentId != parent or entry.name != getattr(path, f"{key}Name"):
                    return False
            parent = identifier
    return True


def status(kit: Path) -> dict:
    manifest = validate_manifest(_read(kit / "manifest.json"), sealed=True)
    cases = {case["case_id"]: case for case in manifest["cases"]}
    catalogs = {task: _catalog_entries(task, item["snapshot"]) if item.get("snapshot") is not None else None
                for task, item in manifest["catalogs"].items()}
    annotations = {}
    for name in LABEL_FILES:
        rows = _read(kit / name)
        if not isinstance(rows, list) or any(not isinstance(row, dict) or set(row) != {"case_id", "decision", "acceptable_answers", "reason"} for row in rows):
            raise ValueError("Blind annotation files must not contain model scores or extra fields")
        if len(rows) != len(cases) or {row["case_id"] for row in rows} != set(cases):
            raise ValueError("Annotation cases must match the frozen manifest exactly")
        complete = sum(_complete(row, cases[row["case_id"]]["task"], catalogs[cases[row["case_id"]]["task"]]) for row in rows)
        annotations[name] = {"complete": complete, "remaining": len(rows) - complete}
    blockers = []
    if any(not case.get("source_reference") or not case.get("rights_reference") or not case["privacy_reviewed"] for case in cases.values()):
        blockers.append("SOURCE_RIGHTS_PRIVACY_REVIEW_PENDING")
    if any(not item.get("version") or item.get("snapshot") is None for item in manifest["catalogs"].values()):
        blockers.append("CATALOG_FREEZE_PENDING")
    if not all(manifest["raters"].values()) or not manifest["blind_review_confirmed"] or not manifest["protocol_review_confirmed"]:
        blockers.append("INDEPENDENT_RATERS_PROTOCOL_PENDING")
    if any(item["remaining"] for item in annotations.values()):
        blockers.append("INDEPENDENT_LABELS_ADJUDICATION_PENDING")
    return {"caseCount": len(cases), "splits": {split: sum(case["split"] == split for case in cases.values()) for split in sorted(SPLITS)},
            "tasks": {task: sum(case["task"] == task for case in cases.values()) for task in sorted(TASKS)},
            "manifestSha256": digest(kit / "manifest.json"),
            "annotations": annotations, "blockers": blockers, "readyForPredictionComparison": not blockers,
            "qualityMetrics": "NOT_COMPUTED", "warnings": ["SYNTHETIC_SMOKE_FIXTURES"] if any(case["source_type"] == "SYNTHETIC_FIXTURE" for case in cases.values()) else []}


def template(output: Path) -> dict:
    if output.exists():
        raise FileExistsError("Do not overwrite an input template")
    cases = []
    inputs = [("SKILL", "dev", {"term": "Ndejs"}), ("SKILL", "test", {"term": "Kubernets"}),
              ("CAREER", "dev", {"title": "Backend developer", "description": "Build Java services.", "requirementsText": "Java and SQL."}),
              ("CAREER", "test", {"title": "Accountant", "description": "Prepare financial reports.", "requirementsText": "Accounting experience."})]
    for index, (task, split, content) in enumerate(inputs, 1):
        cases.append({"case_id": f"CASE{index:03}", "group_id": f"GROUP{index:03}", "task": task, "split": split,
                      "source_type": "SYNTHETIC_FIXTURE", "source_reference": "local-synthetic-smoke",
                      "rights_reference": None, "privacy_reviewed": False, "language": "en", "input": content})
    value = {"protocol": PROTOCOL, "dataset_id": "replace-before-pilot", "rubric_version": "skill-target-career-path-v1",
             "seed": 20261003, "blind_review_confirmed": False, "protocol_review_confirmed": False,
             "raters": {"first": None, "second": None, "adjudicator": None},
             "catalogs": {task: {"version": None, "snapshot": None} for task in sorted(TASKS)}, "cases": cases}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"caseCount": len(cases), "labels": "EMPTY", "qualityMetrics": "NOT_COMPUTED", "purpose": "SYNTHETIC_SMOKE_TEMPLATE"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    example = commands.add_parser("template")
    example.add_argument("--output", type=Path, required=True)
    create = commands.add_parser("prepare")
    create.add_argument("--input", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    read = commands.add_parser("status")
    read.add_argument("--kit", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "template":
            result = template(args.output)
        elif args.command == "prepare":
            result = prepare(args.input, args.output)
        else:
            result = status(args.kit)
    except (OSError, ValueError, TypeError):
        print("INVALID_SUGGESTION_RESEARCH_ARTIFACT: inspect the local input or annotation files", file=sys.stderr)
        return 2
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
