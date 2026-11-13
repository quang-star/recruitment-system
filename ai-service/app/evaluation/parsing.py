"""Offline parsing metrics against explicit single-rater references and frozen inputs."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from statistics import fmean

from app.evaluation.inputs import load_frozen_inputs
from app.evaluation import parsing_gold as reference
from app.evaluation.validation import INPUT_SNAPSHOT_PATH, digest


def counts(expected: set, predicted: list) -> dict:
    unique = set(predicted)
    tp, fp, fn = len(expected & unique), len(unique - expected), len(expected - unique)
    return {**rates(tp, fp, fn), "duplicatePredictions": len(predicted) - len(unique)}


def rates(tp: int, fp: int, fn: int) -> dict:
    return {"tp": tp, "fp": fp, "fn": fn,
            "precision": round(tp / (tp + fp), 6) if tp + fp else None,
            "recall": round(tp / (tp + fn), 6) if tp + fn else None,
            "f1": round(2 * tp / (2 * tp + fp + fn), 6) if 2 * tp + fp + fn else None}


def _normalization(gold: list[dict], predicted: list[dict], catalog) -> dict:
    predictions: dict[str, set] = defaultdict(set)
    for row in predicted:
        predictions[reference.skill_key(row["raw"], catalog)].add(row["canonicalSkillId"])
    eligible = [row for row in gold if row["canonicalSkillId"] is not None
                and reference.skill_key(row["raw"], catalog) in predictions]
    correct = sum(predictions[reference.skill_key(row["raw"], catalog)] == {row["canonicalSkillId"]}
                  for row in eligible)
    return {"correct": correct, "evaluated": len(eligible),
            "accuracy": round(correct / len(eligible), 6) if eligible else None,
            "goldWithoutCanonicalId": sum(row["canonicalSkillId"] is None for row in gold),
            "matchedPredictionMissingCanonicalId": sum(
                None in predictions[reference.skill_key(row["raw"], catalog)] for row in eligible)}


def _interval(row: dict) -> tuple:
    return reference.normalized(row["titleRaw"]), row["startMonth"], row["endMonth"], row["isCurrent"]


def _document(gold: dict, parsed: dict, catalog) -> dict:
    metrics = {}
    normalization = None
    skills, experiences = gold["fields"]["skills"], gold["fields"]["experiences"]
    if skills["status"] in reference.SCORABLE:
        metrics["skills"] = counts({reference.skill_key(row["raw"], catalog) for row in skills["items"]},
                                   [reference.skill_key(row["raw"], catalog) for row in parsed["skills"]])
        normalization = _normalization(skills["items"], parsed["skills"], catalog)
    excluded_intervals = 0
    if experiences["status"] in reference.SCORABLE:
        metrics["titles"] = counts({reference.normalized(row["titleRaw"]) for row in experiences["items"]},
                                   [reference.normalized(row["titleRaw"]) for row in parsed["experiences"]])
        complete = [row for row in experiences["items"] if row["startPrecision"] == "MONTH"
                    and row["endPrecision"] in {"MONTH", "CURRENT"}]
        excluded_intervals = len(experiences["items"]) - len(complete)
        # An incomplete gold interval cannot justify counting any model interval as a false positive.
        if not excluded_intervals:
            metrics["intervals"] = counts({_interval(row) for row in complete},
                                          [_interval(row) for row in parsed["experiences"]])
    return {"cvId": gold["cvId"], "split": gold["split"], "metrics": metrics,
            "fieldStatuses": {name: field["status"] for name, field in gold["fields"].items()},
            "normalization": normalization, "goldIntervalsWithoutMonthPrecision": excluded_intervals,
            "intervalDocumentExcludedForIncompleteGold": bool(excluded_intervals),
            "sourcePages": gold["pageCount"], "evaluationPageCount": len(gold["evaluationPages"]),
            "extractionMethod": parsed["document"]["textExtractionMethod"]}


def _aggregate(rows: list[dict]) -> dict:
    result = {}
    for name in ("skills", "titles", "intervals"):
        selected = [row["metrics"][name] for row in rows if name in row["metrics"]]
        totals = [sum(row[key] for row in selected) for key in ("tp", "fp", "fn")]
        macro = {}
        for metric in ("precision", "recall", "f1"):
            values = [row[metric] for row in selected if row[metric] is not None]
            macro[metric] = {"value": round(fmean(values), 6) if values else None, "documentCount": len(values)}
        result[name] = {"evaluatedDocuments": len(selected), "excludedDocuments": len(rows) - len(selected),
                        "micro": rates(*totals), "macro": macro,
                        "duplicatePredictions": sum(row["duplicatePredictions"] for row in selected)}
    normal = [row["normalization"] for row in rows if row["normalization"] is not None]
    correct, evaluated = (sum(row[key] for row in normal) for key in ("correct", "evaluated"))
    result["normalization"] = {"correct": correct, "evaluated": evaluated,
                               "accuracy": round(correct / evaluated, 6) if evaluated else None,
                               "goldWithoutCanonicalId": sum(row["goldWithoutCanonicalId"] for row in normal),
                               "matchedPredictionMissingCanonicalId": sum(row["matchedPredictionMissingCanonicalId"] for row in normal)}
    return result


def evaluate(kit: Path, gold_path: Path, split: str) -> dict:
    if split not in {"dev", "test"}:
        raise ValueError("Split must be dev or test")
    before = {"manifest": digest(kit / "manifest.json"), "gold": digest(gold_path)}
    manifest, cvs, _, snapshot = load_frozen_inputs(kit)
    gold, catalog = reference.read_gold(gold_path, manifest)
    if (gold["sourceManifestSha256"] != snapshot["sourceManifestSha256"]
            or reference.taxonomy_processing_hash(catalog) != snapshot["processing"].get("taxonomySha256")):
        raise ValueError("Gold source manifest or taxonomy differs from frozen processing")
    selected = [row for row in gold["documents"] if row["split"] == split]
    if not selected or any(not row["reviewComplete"] for row in selected):
        raise ValueError("Complete every parsing reference in the selected split before evaluation")
    for row in selected:
        expected = reference.evaluation_pages(row["pageCount"], cvs[row["cvId"]], snapshot["processing"])
        if sorted(row["evaluationPages"]) != expected:
            raise ValueError("Gold evaluation pages differ from the frozen extraction policy")
    rows = [_document(row, cvs[row["cvId"]], catalog) for row in selected]
    warnings = ["REFERENCE_LABELS_NOT_INDEPENDENTLY_VERIFIED"]
    if gold["annotationProvenance"] != "HUMAN_SINGLE_RATER":
        warnings.append("NON_HUMAN_OR_UNVERIFIED_REFERENCE_LABELS")
    else:
        warnings.append("SINGLE_RATER_REFERENCE_LABELS")
    if gold["reviewerRelationship"] == "AUTHOR_AND_SYSTEM_DEVELOPER":
        warnings.append("REFERENCE_LABELS_AUTHORED_BY_DEVELOPER")
    if any(row["intervalDocumentExcludedForIncompleteGold"] for row in rows):
        warnings.append("INTERVAL_DOCUMENTS_WITH_INCOMPLETE_GOLD_EXCLUDED")
    if any(status not in reference.SCORABLE for row in rows for status in row["fieldStatuses"].values()):
        warnings.append("UNREADABLE_OR_PARTIAL_REFERENCE_FIELDS_EXCLUDED")
    if (before["manifest"] != digest(kit / "manifest.json") or before["gold"] != digest(gold_path)
            or digest(kit / INPUT_SNAPSHOT_PATH) != manifest["inputSnapshot"]["sha256"]):
        raise ValueError("Evaluation inputs changed during parsing evaluation")
    return {"schemaVersion": "parsing-metrics/1.0", "rubricVersion": gold["rubricVersion"], "split": split,
            "documentCount": len(rows), "aggregate": _aggregate(rows), "documents": rows,
            "extractionMethods": dict(Counter(row["extractionMethod"] for row in rows)),
            "parserVersions": sorted({cvs[row["cvId"]]["document"]["parserVersion"] for row in selected}),
            "taxonomyVersion": catalog.version,
            "inputPolicy": {key: snapshot["processing"][key] for key in ("ocrEnabled", "ocrMaxPages", "ocrTimeoutSeconds")},
            "fieldCoverage": {name: dict(Counter(row["fieldStatuses"][name] for row in rows)) for name in reference.FIELDS},
            "notEvaluatedFields": ["education", "languages", "projects", "certificates"],
            "annotationProvenance": gold["annotationProvenance"], "annotationDesign": "single_rater",
            "reviewerRelationship": gold["reviewerRelationship"], "interRaterAgreement": None,
            "asOfMonth": manifest["as_of_month"], "manifestSha256": before["manifest"], "goldSha256": before["gold"],
            "inputSnapshotSha256": manifest["inputSnapshot"]["sha256"], "taxonomySha256": gold["taxonomySha256"],
            "scorerSha256": {name: digest(Path(__file__).with_name(name)) for name in ("parsing.py", "parsing_gold.py")},
            "goldSchemaSha256": digest(reference.schema_path("parsing-gold-v1.schema.json")), "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("prepare")
    create.add_argument("--kit", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    create.add_argument("--taxonomy", type=Path, required=True)
    create.add_argument("--reviewer-id", default="rater-1")
    create.add_argument("--relationship", choices=("AUTHOR_AND_SYSTEM_DEVELOPER", "OTHER", "NOT_STATED"), default="NOT_STATED")
    check = commands.add_parser("status")
    check.add_argument("--kit", type=Path, required=True)
    check.add_argument("--gold", type=Path, required=True)
    score = commands.add_parser("evaluate")
    score.add_argument("--kit", type=Path, required=True)
    score.add_argument("--gold", type=Path, required=True)
    score.add_argument("--split", choices=("dev", "test"), required=True)
    score.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "prepare":
        result = reference.prepare(args.kit, args.output, args.taxonomy, reviewer_id=args.reviewer_id, relationship=args.relationship)
    elif args.command == "status":
        result = reference.status(args.kit, args.gold)
    else:
        if args.output.exists():
            raise FileExistsError("Metric output already exists; select a new file")
        result = evaluate(args.kit, args.gold, args.split)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("x", encoding="utf-8") as stream:
            json.dump(result, stream, indent=2, allow_nan=False)
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
