"""Prepare and validate private parsing references without generating labels."""
from collections import Counter
from dataclasses import asdict
from datetime import date
from functools import lru_cache
import hashlib
from io import BytesIO
import json
import logging
import math
from pathlib import Path
import unicodedata

from jsonschema import Draft202012Validator, FormatChecker
from pypdf import PdfReader

from app.evaluation.validation import dataset_digest, digest, read_input_snapshot, read_manifest
from app.taxonomy.normalizer import Taxonomy, build_taxonomy

FIELDS = ("skills", "experiences", "education", "languages", "projects", "certificates")
SCORABLE = {"PRESENT", "ABSENT"}


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def json_digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def source_index(documents: list[dict]) -> str:
    return json_digest(sorted(({k: row[k] for k in ("cvId", "sourceHash", "split", "pageCount")}
                               for row in documents), key=lambda row: row["cvId"]))


def schema_path(name: str) -> Path:
    root = Path(__file__).resolve().parents[3] / "contracts/schemas"
    return (root if root.is_dir() else Path("/app/contracts/schemas")) / name


@lru_cache(maxsize=2)
def validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(json.loads(schema_path(name).read_text(encoding="utf-8")),
                                format_checker=FormatChecker())


def skill_key(raw: str, catalog: Taxonomy) -> str:
    # Reuse the taxonomy's alias policy (including dash variants) without changing its runtime context.
    key = normalized(raw).replace("–", "-").replace("—", "-")
    entry = catalog.by_alias.get(key)
    return "id:" + entry[0] if entry else "raw:" + normalized(raw)


def evaluation_pages(page_count: int, payload: dict, processing: dict) -> list[int]:
    cap, timeout = processing.get("ocrMaxPages"), processing.get("ocrTimeoutSeconds")
    if not isinstance(timeout, (int, float)) or isinstance(timeout, bool):
        raise ValueError("Frozen extraction policy is missing or invalid")
    if (type(processing.get("ocrEnabled")) is not bool or type(cap) is not int or not 1 <= cap <= 20
            or not math.isfinite(timeout) or not 5 <= timeout <= 300):
        raise ValueError("Frozen extraction policy is missing or invalid")
    method = payload["document"]["textExtractionMethod"]
    limited = method == "OCR" or (method == "NONE" and processing.get("ocrEnabled") is True)
    if limited:
        page_count = min(page_count, cap)
    return list(range(1, page_count + 1))


def _experience(item: dict) -> None:
    if ((item["startPrecision"] == "MONTH") != (item["startMonth"] is not None)
            or (item["endPrecision"] == "MONTH") != (item["endMonth"] is not None)
            or item["isCurrent"] != (item["endPrecision"] == "CURRENT")
            or (item["startMonth"] and item["endMonth"] and item["endMonth"] < item["startMonth"])):
        raise ValueError("Gold experience date precision or interval is inconsistent")
    for month in (item["startMonth"], item["endMonth"]):
        if month is not None:
            try:
                date.fromisoformat(month + "-01")
            except ValueError:
                raise ValueError("Gold experience requires valid calendar months") from None


def validate(gold: dict, manifest: dict) -> Taxonomy:
    if not validator("parsing-gold-v1.schema.json").is_valid(gold):
        raise ValueError("Parsing gold does not match parsing-gold/1.0; check field types and statuses")
    if not validator("skill-taxonomy-v2.schema.json").is_valid(gold["taxonomySnapshot"]):
        raise ValueError("Gold taxonomy snapshot does not match skill-taxonomy/2.0")
    if (gold["datasetSha256"] != dataset_digest(manifest) or gold["asOfMonth"] != manifest["as_of_month"]
            or gold["taxonomySha256"] != json_digest(gold["taxonomySnapshot"])
            or gold["sourceIndexSha256"] != source_index(gold["documents"])):
        raise ValueError("Gold source, taxonomy or dataset binding changed")
    cvs = {row["id"]: row for row in manifest["cvs"]}
    if len(gold["documents"]) != len(cvs) or {row["cvId"] for row in gold["documents"]} != set(cvs):
        raise ValueError("Gold document IDs must match the annotation kit exactly")
    catalog = build_taxonomy(gold["taxonomySnapshot"])
    seen_ids: set[str] = set()
    seen_aliases: dict[str, str] = {}
    for skill in gold["taxonomySnapshot"]["skills"]:
        identifier = skill["stableId"]
        if identifier in seen_ids:
            raise ValueError("Gold taxonomy contains duplicate skill IDs")
        seen_ids.add(identifier)
        terms = [skill["canonicalName"], skill["normalizedName"]]
        terms.extend(term for alias in skill["aliases"] for term in (alias["value"], alias["normalized"]))
        for term in terms:
            key = normalized(term).replace("–", "-").replace("—", "-")
            if key in seen_aliases and seen_aliases[key] != identifier:
                raise ValueError("Gold taxonomy contains an ambiguous alias")
            seen_aliases[key] = identifier
    for row in gold["documents"]:
        source = cvs[row["cvId"]]
        if row["sourceHash"] != source["sha256"] or row["split"] != source["split"]:
            raise ValueError("Gold source hash or split differs from the kit")
        scope, reviewed = set(row["evaluationPages"]), set(row["pagesReviewed"])
        if (max(scope) > row["pageCount"] or not reviewed <= scope
                or (row["readingMethod"] == "NOT_REVIEWED" and reviewed)
                or (row["readingMethod"] != "NOT_REVIEWED" and not reviewed)):
            raise ValueError("Gold page coverage or reading method is inconsistent")
        if row["reviewComplete"] and (reviewed != scope or row["readingMethod"] == "NOT_REVIEWED"
                                      or any(field["status"] == "NOT_REVIEWED" for field in row["fields"].values())):
            raise ValueError("Complete gold requires reviewed pages and explicit status for all fields")
        for field in row["fields"].values():
            if any(item["evidencePage"] not in reviewed for item in field["items"]):
                raise ValueError("Gold evidence must belong to a reviewed evaluation page")
        skills = row["fields"]["skills"]["items"]
        keys = [skill_key(item["raw"], catalog) for item in skills]
        if len(keys) != len(set(keys)):
            raise ValueError("Gold skills must have unique normalized keys per document")
        for item, key in zip(skills, keys):
            if item["canonicalSkillId"] is not None and key != "id:" + item["canonicalSkillId"]:
                raise ValueError("Gold canonical skill must agree with its pinned raw alias")
        for item in row["fields"]["experiences"]["items"]:
            _experience(item)
    return catalog


def read_gold(path: Path, manifest: dict) -> tuple[dict, Taxonomy]:
    gold = json.loads(path.read_text(encoding="utf-8"))
    return gold, validate(gold, manifest)


def prepare(kit: Path, output: Path, taxonomy_path: Path, *, reviewer_id: str = "rater-1",
            relationship: str = "NOT_STATED") -> dict:
    if output.exists():
        raise FileExistsError("Gold output already exists; select a new file")
    manifest = read_manifest(kit)
    snapshot = read_input_snapshot(kit, manifest)
    taxonomy_bytes = taxonomy_path.read_bytes()
    taxonomy_snapshot = json.loads(taxonomy_bytes)
    documents = []
    for cv in manifest["cvs"]:
        path = Path(cv["path"]).resolve()
        if path.suffix.lower() != ".pdf" or "secrets" in {part.lower() for part in path.parts}:
            raise ValueError("Parsing references require local PDF sources")
        content = path.read_bytes()
        if hashlib.sha256(content).hexdigest() != cv["sha256"]:
            raise ValueError("Source PDF changed before parsing reference preparation")
        logger = logging.getLogger("pypdf")
        previous_level = logger.level
        try:
            logger.setLevel(logging.CRITICAL)
            pages = len(PdfReader(BytesIO(content)).pages)
        except Exception:
            raise ValueError("Source PDF metadata could not be read") from None
        finally:
            logger.setLevel(previous_level)
        if pages < 1:
            raise ValueError("Source PDF must contain at least one page")
        scope = (evaluation_pages(pages, snapshot["cvs"][cv["id"]], snapshot["processing"])
                 if snapshot else list(range(1, pages + 1)))
        documents.append({"cvId": cv["id"], "sourceHash": cv["sha256"], "split": cv["split"], "pageCount": pages,
                          "evaluationPages": scope, "pagesReviewed": [],
                          "readingMethod": "NOT_REVIEWED", "reviewComplete": False,
                          "fields": {name: {"status": "NOT_REVIEWED", "items": []} for name in FIELDS}})
    gold = {"schemaVersion": "parsing-gold/1.0", "rubricVersion": "parsing-rubric/1.0",
            "datasetSha256": dataset_digest(manifest),
            "sourceManifestSha256": snapshot["sourceManifestSha256"] if snapshot else digest(kit / "manifest.json"),
            "sourceIndexSha256": source_index(documents), "asOfMonth": manifest["as_of_month"],
            "annotationProvenance": "UNKNOWN", "reviewerId": reviewer_id, "reviewerRelationship": relationship,
            "taxonomySnapshot": taxonomy_snapshot, "taxonomySha256": json_digest(taxonomy_snapshot),
            "taxonomySourceSha256": hashlib.sha256(taxonomy_bytes).hexdigest(), "documents": documents}
    validate(gold, manifest)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        json.dump(gold, stream, ensure_ascii=False, indent=2, allow_nan=False)
    return {"documents": len(documents), "reviewed": 0, "annotationProvenance": "UNKNOWN"}


def status(kit: Path, path: Path) -> dict:
    manifest = read_manifest(kit)
    gold, _ = read_gold(path, manifest)
    snapshot = read_input_snapshot(kit, manifest)
    return {"documents": len(gold["documents"]),
            "reviewedBySplit": {split: sum(row["reviewComplete"] for row in gold["documents"] if row["split"] == split)
                                for split in ("dev", "test")},
            "fieldStatuses": {field: dict(Counter(row["fields"][field]["status"] for row in gold["documents"]))
                              for field in FIELDS},
            "annotationProvenance": gold["annotationProvenance"], "goldSha256": digest(path),
            "frozenInputsAvailable": snapshot is not None}


def taxonomy_processing_hash(catalog: Taxonomy) -> str:
    # Same serialization as inputs.freeze, not the JSON snapshot file's byte hash.
    return hashlib.sha256(json.dumps(asdict(catalog), sort_keys=True).encode()).hexdigest()
