"""Validate research inputs without exposing CV text or annotation reasons."""
import csv
import hashlib
import json
import math
import re
from pathlib import Path


LABEL_FILES = ("rater-1.csv", "rater-2.csv", "adjudication.csv")
VARIANTS = {"baseline", "semantic", "hybrid"}
PROVENANCES = ("HUMAN_INDEPENDENT", "HUMAN_SINGLE_RATER", "MODEL_GENERATED", "UNKNOWN")
INPUT_SNAPSHOT_PATH = "model-only/inputs.json"
INPUT_SNAPSHOT_VERSION = "evaluation-inputs/1.0"


def annotation_files(manifest: dict) -> tuple[str, ...]:
    """Select real annotation inputs without inventing a second rater."""
    if manifest.get("annotation_provenance") == "HUMAN_SINGLE_RATER":
        return ("rater-1.csv",)
    return LABEL_FILES


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dataset_digest(manifest: dict) -> str:
    """Bind parsed inputs to document content, pairs, splits and calculation month."""
    value = {key: manifest[key] for key in ("as_of_month", "jobs", "pairs")}
    value["cvs"] = [{key: cv[key] for key in ("id", "sha256", "split")} for cv in manifest["cvs"]]
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     allow_nan=False).encode("utf-8")).hexdigest()


def read_input_snapshot(kit: Path, manifest: dict) -> dict | None:
    if "inputSnapshot" not in manifest:
        return None
    reference = manifest["inputSnapshot"]
    if (not isinstance(reference, dict) or reference.get("path") != INPUT_SNAPSHOT_PATH
            or reference.get("schemaVersion") != INPUT_SNAPSHOT_VERSION
            or not re.fullmatch(r"[0-9a-f]{64}", str(reference.get("sha256", "")))):
        raise ValueError("Invalid frozen input snapshot reference")
    path = kit / INPUT_SNAPSHOT_PATH
    if path.resolve() != kit.resolve() / INPUT_SNAPSHOT_PATH or not path.is_file():
        raise ValueError("Frozen input snapshot is missing or outside the kit")
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != reference["sha256"]:
        raise ValueError("Frozen input snapshot changed; create a new frozen kit")
    snapshot = json.loads(content)
    if (not isinstance(snapshot, dict) or snapshot.get("schemaVersion") != INPUT_SNAPSHOT_VERSION
            or snapshot.get("datasetSha256") != dataset_digest(manifest)):
        raise ValueError("Frozen input snapshot does not match the dataset")
    return snapshot


def input_snapshot_digest(kit: Path, manifest: dict) -> str | None:
    if read_input_snapshot(kit, manifest) is None:
        return None
    return str(manifest["inputSnapshot"]["sha256"])


def read_manifest(kit: Path) -> dict:
    manifest = json.loads((kit / "manifest.json").read_text(encoding="utf-8"))
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(manifest.get("as_of_month", ""))):
        raise ValueError("Manifest requires a fixed as_of_month (YYYY-MM)")
    cvs, jobs, pairs = (manifest.get(key, []) for key in ("cvs", "jobs", "pairs"))
    for records, key in ((cvs, "id"), (jobs, "id"), (pairs, "pair_id")):
        ids = [record.get(key) for record in records]
        if not ids or any(not isinstance(value, str) or not value.strip() for value in ids):
            raise ValueError("Manifest IDs must be nonempty strings")
        if len(ids) != len(set(ids)):
            raise ValueError("Manifest contains duplicate IDs")
    candidates = {cv["id"]: cv for cv in cvs}
    job_ids = {job["id"] for job in jobs}
    hashes = set()
    for cv in cvs:
        sha = cv.get("sha256", "")
        if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
            raise ValueError("Each CV requires a SHA-256 hash")
        if sha in hashes:
            raise ValueError("Duplicate PDF content: CVs must be unique across dev/test")
        hashes.add(sha)
        if cv.get("split") not in {"dev", "test"}:
            raise ValueError("CV split must be dev or test")
    seen = set()
    for pair in pairs:
        candidate, job = pair.get("candidate_id"), pair.get("job_id")
        if candidate not in candidates or job not in job_ids:
            raise ValueError("Pair references an unknown CV or job")
        if pair.get("split") != candidates[candidate]["split"]:
            raise ValueError("Pair split differs from its CV split")
        if (candidate, job) in seen:
            raise ValueError("Duplicate candidate/job pair")
        seen.add((candidate, job))
    return manifest


def annotation_rows(path: Path, manifest: dict) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not {"pair_id", "label", "reason"}.issubset(reader.fieldnames or []):
            raise ValueError(f"Missing annotation columns in {path.name}")
        rows = list(reader)
    pairs = {pair["pair_id"]: pair for pair in manifest["pairs"]}
    if len(rows) != len(pairs) or {row["pair_id"] for row in rows} != set(pairs):
        raise ValueError(f"Missing, duplicate or unexpected pairs in {path.name}")
    for row in rows:
        for field in ("candidate_id", "job_id", "split"):
            if field in row and row[field] != pairs[row["pair_id"]][field]:
                raise ValueError(f"Annotation metadata differs from manifest in {path.name}")
    return rows


def complete_label(row: dict) -> bool:
    return row.get("label") in {"0", "1", "2", "3", "4"} and bool((row.get("reason") or "").strip())


def prediction_path(kit: Path, variant: str) -> Path:
    if variant not in VARIANTS:
        raise ValueError("Unknown prediction variant")
    filename = "predictions.csv" if variant == "baseline" else f"predictions-{variant}.csv"
    return kit / "model-only" / filename


def record_predictions(kit: Path, variant: str) -> None:
    path = prediction_path(kit, variant)
    metadata = {"manifestSha256": digest(kit / "manifest.json"), "predictionsSha256": digest(path),
                "variant": variant,
                "inputSnapshotSha256": input_snapshot_digest(kit, read_manifest(kit))}
    path.with_suffix(".metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def read_predictions(kit: Path, manifest: dict, variant: str) -> list[dict]:
    path = prediction_path(kit, variant)
    metadata_path = path.with_suffix(".metadata.json")
    if not metadata_path.exists():
        raise ValueError("Prediction provenance missing; rerun scoring for this variant")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if (metadata.get("manifestSha256") != digest(kit / "manifest.json")
            or metadata.get("predictionsSha256") != digest(path)
            or metadata.get("variant") != variant
            or metadata.get("inputSnapshotSha256") != input_snapshot_digest(kit, manifest)):
        raise ValueError("Stale or changed predictions; rerun scoring for this variant")
    with path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    expected = {pair["pair_id"] for pair in manifest["pairs"]}
    if len(rows) != len(expected) or {row.get("pair_id") for row in rows} != expected:
        raise ValueError("Prediction pairs must match the annotation manifest exactly")
    versions = {row.get("algorithm_version", "").strip() for row in rows}
    if len(versions) != 1 or "" in versions:
        raise ValueError("Predictions must have exactly one nonempty algorithm version")
    for row in rows:
        score = float(row["predicted_score"])
        if not math.isfinite(score) or not 0 <= score <= 100:
            raise ValueError("Prediction scores must be finite and between 0 and 100")
    return rows
