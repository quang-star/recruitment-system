"""Freeze local parsed/OCR research inputs without changing product scoring."""
from dataclasses import asdict
from datetime import UTC, datetime
from functools import lru_cache
import hashlib
from importlib.metadata import version
import json
import math
from pathlib import Path
import shutil
import sys

from jsonschema import Draft202012Validator, FormatChecker

from app.cv.parser import PARSER_VERSION as CV_PARSER_VERSION, parse_pdf
from app.jd.parser import PARSER_VERSION as JD_PARSER_VERSION, parse_jd
from app.taxonomy.normalizer import taxonomy
from app.evaluation.validation import (
    INPUT_SNAPSHOT_PATH, INPUT_SNAPSHOT_VERSION, annotation_files, annotation_rows,
    dataset_digest, digest, read_input_snapshot, read_manifest,
)


def _parse_inputs(manifest: dict, *, ocr_enabled: bool = False, ocr_max_pages: int = 5,
                  ocr_timeout_seconds: float = 60.0) -> tuple[dict, dict]:
    cvs = {}
    for cv in manifest["cvs"]:
        path = Path(cv["path"]).resolve()
        if (path.suffix.lower() != ".pdf" or path.name.lower().startswith(".env")
                or "secrets" in {p.lower() for p in path.parts}):
            raise ValueError("Evaluation sources must be local PDF documents")
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != cv["sha256"]:
            raise ValueError("Source PDF changed after annotation kit creation")
        cvs[cv["id"]] = parse_pdf(
            str((int(cv["sha256"][:16], 16) & ((1 << 63) - 1)) or 1), cv["sha256"], content,
            ocr_enabled=ocr_enabled, ocr_max_pages=ocr_max_pages,
            ocr_timeout_seconds=ocr_timeout_seconds, enricher=None,
        )
    jobs = {}
    for job in manifest["jobs"]:
        source_hash = hashlib.sha256(json.dumps(job, sort_keys=True).encode()).hexdigest()
        jobs[job["id"]] = parse_jd(
            str((int(source_hash[:16], 16) & ((1 << 63) - 1)) or 1), source_hash,
            job["title"], job["description"], job["requirements"], enricher=None,
        )
    return cvs, jobs


@lru_cache(maxsize=2)
def _validator(kind: str) -> Draft202012Validator:
    root = Path(__file__).resolve().parents[3] / "contracts/schemas"
    if not root.is_dir():
        root = Path("/app/contracts/schemas")
    schema = json.loads((root / f"parsed-{kind}-v2.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(schema, format_checker=FormatChecker())


def _validate_payloads(snapshot: dict, manifest: dict) -> tuple[dict, dict]:
    cvs, jobs = snapshot.get("cvs"), snapshot.get("jobs")
    if (not isinstance(cvs, dict) or not isinstance(jobs, dict)
            or set(cvs) != {cv["id"] for cv in manifest["cvs"]}
            or set(jobs) != {job["id"] for job in manifest["jobs"]}):
        raise ValueError("Frozen input document IDs do not match the dataset")
    for kind, records, payloads in (("cv", manifest["cvs"], cvs), ("jd", manifest["jobs"], jobs)):
        for record in records:
            payload = payloads[record["id"]]
            if not _validator(kind).is_valid(payload):
                raise ValueError("Frozen parsed input does not match its versioned schema")
            expected = (record["sha256"] if kind == "cv" else
                        hashlib.sha256(json.dumps(record, sort_keys=True).encode()).hexdigest())
            if payload["document"]["sourceHash"] != expected:
                raise ValueError("Frozen parsed input source hash does not match the dataset")
    return cvs, jobs


def load_inputs(kit: Path):
    manifest = read_manifest(kit)
    snapshot = read_input_snapshot(kit, manifest)
    cvs, jobs = (_validate_payloads(snapshot, manifest) if snapshot is not None
                 else _parse_inputs(manifest))
    return manifest, cvs, jobs


def load_frozen_inputs(kit: Path) -> tuple[dict, dict, dict, dict]:
    """Require a verified snapshot; never fall back to opening source documents."""
    manifest = read_manifest(kit)
    snapshot = read_input_snapshot(kit, manifest)
    if snapshot is None:
        raise ValueError("Evaluation requires frozen inputs; freeze a new kit first")
    cvs, jobs = _validate_payloads(snapshot, manifest)
    return manifest, cvs, jobs, snapshot


def _implementation_hashes() -> dict[str, str]:
    root = Path(__file__).resolve().parents[1]
    paths = ("cv/parser.py", "cv/ocr.py", "jd/parser.py", "taxonomy/normalizer.py",
             "extraction/evidence.py", "extraction/skill_proposals.py")
    return {name: digest(root / name) for name in paths}


def freeze(source: Path, output: Path, *, ocr_enabled: bool = False,
           ocr_max_pages: int = 5, ocr_timeout_seconds: float = 60.0) -> dict:
    """Create a new private input kit; never overwrite source labels or old runs."""
    if output.exists():
        raise FileExistsError("Frozen output already exists; select a new kit directory")
    if (type(ocr_enabled) is not bool or type(ocr_max_pages) is not int or not 1 <= ocr_max_pages <= 20
            or not math.isfinite(ocr_timeout_seconds) or not 5 <= ocr_timeout_seconds <= 300):
        raise ValueError("Use explicit OCR settings: 1–20 pages and 5–300 seconds")
    manifest = read_manifest(source)
    if "inputSnapshot" in manifest:
        raise ValueError("Inputs are already frozen; compare the existing frozen kit")
    label_files = annotation_files(manifest)
    for name in label_files:
        annotation_rows(source / name, manifest)
    source_hashes = {name: digest(source / name) for name in ("manifest.json", *label_files)}
    cvs, jobs = _parse_inputs(manifest, ocr_enabled=ocr_enabled, ocr_max_pages=ocr_max_pages,
                              ocr_timeout_seconds=ocr_timeout_seconds)
    catalog = taxonomy()
    snapshot = {
        "schemaVersion": INPUT_SNAPSHOT_VERSION, "datasetSha256": dataset_digest(manifest),
        "sourceManifestSha256": source_hashes["manifest.json"],
        "createdAt": datetime.now(UTC).isoformat(), "asOfMonth": manifest["as_of_month"],
        "processing": {
            "ocrEnabled": ocr_enabled, "ocrMaxPages": ocr_max_pages,
            "ocrTimeoutSeconds": ocr_timeout_seconds, "externalProvider": None,
            "cvParserVersion": CV_PARSER_VERSION, "jdParserVersion": JD_PARSER_VERSION,
            "taxonomyVersion": catalog.version,
            "taxonomySha256": hashlib.sha256(json.dumps(asdict(catalog), sort_keys=True).encode()).hexdigest(),
            "implementationSha256": _implementation_hashes(),
            "pythonVersion": sys.version.split()[0], "pypdfVersion": version("pypdf"),
            "ocrEngineVersion": "NOT_CAPTURED",
        },
        "cvs": cvs, "jobs": jobs,
        "privacy": "Private parsed source evidence; anonymization is not guaranteed. Do not share with raters.",
    }
    _validate_payloads(snapshot, manifest)
    if any(digest(source / name) != value for name, value in source_hashes.items()):
        raise ValueError("Source annotation kit changed while freezing inputs")
    output.mkdir(parents=True)
    target = output / INPUT_SNAPSHOT_PATH
    target.parent.mkdir()
    target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    manifest["inputSnapshot"] = {"schemaVersion": INPUT_SNAPSHOT_VERSION,
                                 "path": INPUT_SNAPSHOT_PATH, "sha256": digest(target)}
    for name in label_files:
        shutil.copyfile(source / name, output / name)
    if (source / "INSTRUCTIONS.md").is_file():
        shutil.copyfile(source / "INSTRUCTIONS.md", output / "INSTRUCTIONS.md")
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    if any(digest(source / name) != value or digest(output / name) != value
           for name, value in source_hashes.items() if name != "manifest.json"):
        raise ValueError("Source annotations changed while copying frozen inputs")
    if digest(source / "manifest.json") != source_hashes["manifest.json"]:
        raise ValueError("Source annotation kit changed while freezing inputs")
    methods: dict[str, int] = {}
    for payload in cvs.values():
        method = payload["document"]["textExtractionMethod"]
        methods[method] = methods.get(method, 0) + 1
    return {"cvs": len(cvs), "jobs": len(jobs), "inputSnapshotSha256": digest(target),
            "extractionMethods": methods, "ocrEnabled": ocr_enabled,
            "sourceUnchanged": True,
            "anonymizationVerified": manifest.get("anonymization_verified") is True}

