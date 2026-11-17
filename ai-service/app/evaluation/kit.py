"""Build blind annotation kits with an explicit single- or two-rater design."""
import argparse
import csv
from datetime import date
import hashlib
import json
from pathlib import Path
import random
from typing import cast

from app.evaluation.inputs import freeze, load_inputs
from app.matching.algorithm import ALGORITHM_VERSION, compute_match
from app.evaluation.metrics import EvaluationRow, evaluate
from app.evaluation.validation import (
    LABEL_FILES, PROVENANCES, VARIANTS, annotation_files, annotation_rows, complete_label, digest,
    input_snapshot_digest, prediction_path, read_manifest, read_predictions, record_predictions,
)


def _csv(path, rows, fields):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def prepare(cv_dir: Path, jobs_path: Path, output: Path, count: int, seed: int,
            source: str = "Unspecified; document provenance before reporting results", *,
            annotation_provenance: str = "UNKNOWN"):
    if annotation_provenance not in PROVENANCES:
        raise ValueError("Unknown annotation provenance")
    jobs = json.loads(jobs_path.read_text(encoding="utf-8"))
    if not jobs or len({job["id"] for job in jobs}) != len(jobs):
        raise ValueError("Jobs must have unique IDs")
    files = sorted(cv_dir.glob("*.pdf"))
    if count < 2 or count > len(files):
        raise ValueError("Select between 2 and the available number of PDFs")
    selected = random.Random(seed).sample(files, count)
    # Never overwrite human annotations on a rerun.
    if output.exists():
        raise FileExistsError("Annotation output already exists")
    cv_manifest = []
    for index, file in enumerate(selected):
        cv_manifest.append({"id": f"CV{index + 1:03}", "path": str(file.resolve()),
                            "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                            "split": "dev" if index < max(1, count // 5) else "test"})
    pairs = [{"pair_id": f"{cv['id']}--{job['id']}", "candidate_id": cv["id"], "job_id": job["id"],
              "split": cv["split"]} for cv in cv_manifest for job in jobs]
    if len({cv["sha256"] for cv in cv_manifest}) != len(cv_manifest):
        raise ValueError("Duplicate PDF content: select unique CVs before splitting")
    manifest = {"seed": seed, "as_of_month": date.today().strftime("%Y-%m"),
                "source": source,
                "anonymization_verified": False, "annotation_provenance": annotation_provenance,
                "cvs": cv_manifest, "jobs": jobs, "pairs": pairs}
    output.mkdir(parents=True, exist_ok=False)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    single_rater = annotation_provenance == "HUMAN_SINGLE_RATER"
    for name in (("rater-1.csv",) if single_rater else LABEL_FILES[:2]):
        _csv(output / name, [{**pair, "label": "", "reason": ""} for pair in pairs],
             ["pair_id", "candidate_id", "job_id", "split", "label", "reason"])
    if not single_rater:
        _csv(output / "adjudication.csv", [{"pair_id": pair["pair_id"], "label": "", "reason": ""} for pair in pairs],
             ["pair_id", "label", "reason"])
    annotation_instructions = (
        "One person reads the source PDF and job description in manifest.json. "
        "This is a single-rater study: no second-rater agreement or independent adjudication is available. "
        "Do not copy these labels into a fictitious second-rater file. "
        if single_rater else
        "Two people independently read the source PDF and job description in manifest.json. "
        "Adjudicate disagreements only after both finish. "
    )
    (output / "INSTRUCTIONS.md").write_text(
        "# Blind annotation\n\n" + annotation_instructions +
        "Do not show model scores to raters. Labels: 0 unrelated; 1 weak fit; 2 partial fit; "
        "3 strong fit with limited gaps; 4 meets the stated requirements with clear evidence. "
        "Record a reason, including missing/uncertain evidence.\n\n"
        "Document source provenance; do not assume these are verified applicants. Supplied example JDs are explicitly synthetic. "
        "Inspect personal information before sharing; anonymization is not verified. Keep raw files local. "
        "Candidate splits are disjoint. Tune on dev only and report test separately. "
        "Treat Current dates relative to the fixed manifest month, and disclose that the source snapshot date is unknown.\n",
        encoding="utf-8")
    return {"cv_count": count, "job_count": len(jobs), "pairs": len(pairs), "labels": "pending"}


def score(kit: Path):
    manifest, cvs, jobs = load_inputs(kit)
    rows = []
    for pair in manifest["pairs"]:
        result = compute_match(cvs[pair["candidate_id"]], jobs[pair["job_id"]], as_of_month=manifest["as_of_month"])
        rows.append({"pair_id": pair["pair_id"], "predicted_score": result.final_score,
                     "algorithm_version": ALGORITHM_VERSION})
    private = kit / "model-only"
    private.mkdir(exist_ok=True)
    _csv(private / "predictions.csv", rows, ["pair_id", "predicted_score", "algorithm_version"])
    record_predictions(kit, "baseline")
    return {"scored_pairs": len(rows), "metrics": "pending independent labels"}


def _labels(path: Path, expected: set[str]):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        rows = list(csv.DictReader(stream))
    if len(rows) != len(expected) or {row["pair_id"] for row in rows} != expected:
        raise ValueError(f"Missing, duplicate or unexpected pairs in {path.name}")
    result = {}
    for row in rows:
        if row["label"] not in {"0", "1", "2", "3", "4"} or not row.get("reason", "").strip():
            raise ValueError(f"Complete independent labels and reasons in {path.name} first")
        result[row["pair_id"]] = int(row["label"])
    return result


def evaluate_kit(kit: Path, split: str, variant: str = "baseline"):
    if variant not in VARIANTS:
        raise ValueError("Unknown prediction variant")
    if split not in {"dev", "test"}:
        raise ValueError("Split must be dev or test")
    manifest = read_manifest(kit)
    expected = {pair["pair_id"] for pair in manifest["pairs"]}
    label_files = annotation_files(manifest)
    for name in label_files:
        annotation_rows(kit / name, manifest)
    single_rater = manifest.get("annotation_provenance") == "HUMAN_SINGLE_RATER"
    first = _labels(kit / label_files[0], expected)
    second = {} if single_rater else _labels(kit / "rater-2.csv", expected)
    gold = first if single_rater else _labels(kit / "adjudication.csv", expected)
    predictions = read_predictions(kit, manifest, variant)
    scores = {row["pair_id"]: float(row["predicted_score"]) for row in predictions}
    rows = [EvaluationRow(pair["pair_id"], pair["job_id"], gold[pair["pair_id"]], scores[pair["pair_id"]],
                          None if single_rater else first[pair["pair_id"]],
                          None if single_rater else second[pair["pair_id"]])
            for pair in manifest["pairs"] if pair["split"] == split]
    result = evaluate(rows)
    result.update(split=split, variant=variant, asOfMonth=manifest["as_of_month"],
                  algorithmVersions=sorted({row["algorithm_version"] for row in predictions}),
                  manifestSha256=digest(kit / "manifest.json"),
                  predictionsSha256=digest(prediction_path(kit, variant)),
                  annotationSha256={name: digest(kit / name) for name in label_files},
                  inputSnapshotSha256=input_snapshot_digest(kit, manifest),
                  inputMode="FROZEN_PARSED" if "inputSnapshot" in manifest else "LEGACY_TEXT_ONLY")
    provenance = manifest.get("annotation_provenance", "UNKNOWN")
    result["annotationProvenance"] = provenance
    result["annotationDesign"] = "single_rater" if single_rater else "two_rater_adjudicated"
    if single_rater:
        cast(list[str], result["warnings"]).append("SINGLE_RATER_REFERENCE_LABELS")
    elif provenance != "HUMAN_INDEPENDENT":
        # Model-authored reference files are useful for diagnostics, but their
        # agreement must not be presented as agreement between human raters.
        result["interRaterAgreement"] = None
        cast(list[str], result["warnings"]).append(
            "MODEL_GENERATED_REFERENCE_LABELS" if provenance == "MODEL_GENERATED"
            else "LABEL_PROVENANCE_UNVERIFIED")
    if manifest.get("anonymization_verified") is not True:
        cast(list[str], result["warnings"]).append("ANONYMIZATION_NOT_VERIFIED")
    if "inputSnapshot" not in manifest:
        cast(list[str], result["warnings"]).append("INPUTS_NOT_FROZEN")
    (kit / f"metrics-{variant}-{split}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def status(kit: Path):
    """Read-only progress; never prints source paths, scores or human reasons."""
    manifest = read_manifest(kit)
    annotations, completed = {}, {}
    label_files = annotation_files(manifest)
    for name in label_files:
        rows = annotation_rows(kit / name, manifest)
        completed[name] = {row["pair_id"]: int(row["label"]) for row in rows if complete_label(row)}
        annotations[name] = {"total": len(rows), "complete": len(completed[name]),
                             "remaining": len(rows) - len(completed[name])}
    single_rater = manifest.get("annotation_provenance") == "HUMAN_SINGLE_RATER"
    first = completed[label_files[0]]
    second = {} if single_rater else completed["rater-2.csv"]
    common = first.keys() & second.keys()
    predictions = {}
    for variant in sorted(VARIANTS):
        if not prediction_path(kit, variant).exists():
            predictions[variant] = "missing"
            continue
        try:
            read_predictions(kit, manifest, variant)
            predictions[variant] = "ready"
        except ValueError as error:
            predictions[variant] = str(error)
    return {"pairs": len(manifest["pairs"]), "cvs": len(manifest["cvs"]), "jobs": len(manifest["jobs"]),
            "splits": {split: sum(pair["split"] == split for pair in manifest["pairs"])
                       for split in ("dev", "test")},
            "annotations": annotations,
            "disagreements": None if single_rater else sum(first[pair] != second[pair] for pair in common),
            "predictions": predictions,
            "readyForMetrics": all(item["remaining"] == 0 for item in annotations.values())
                               and any(value == "ready" for value in predictions.values()),
            "annotationProvenance": manifest.get("annotation_provenance", "UNKNOWN"),
            "annotationDesign": "single_rater" if single_rater else "two_rater_adjudicated",
            "anonymizationVerified": manifest.get("anonymization_verified") is True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("prepare")
    create.add_argument("--cv-dir", type=Path, required=True)
    create.add_argument("--jobs", type=Path, required=True)
    create.add_argument("--output", type=Path, required=True)
    create.add_argument("--count", type=int, default=30)
    create.add_argument("--seed", type=int, default=20260928)
    create.add_argument("--source", default="Unspecified; document provenance before reporting results")
    create.add_argument("--annotation-provenance", choices=PROVENANCES, default="UNKNOWN")
    frozen = sub.add_parser("freeze")
    frozen.add_argument("--source-kit", type=Path, required=True)
    frozen.add_argument("--output", type=Path, required=True)
    frozen.add_argument("--ocr-enabled", action="store_true")
    frozen.add_argument("--ocr-max-pages", type=int, default=5)
    frozen.add_argument("--ocr-timeout-seconds", type=float, default=60.0)
    for name in ("score", "evaluate", "status"):
        command = sub.add_parser(name)
        command.add_argument("--kit", type=Path, required=True)
        if name == "evaluate":
            command.add_argument("--split", choices=["dev", "test"], default="test")
            command.add_argument("--variant", choices=["baseline", "semantic", "hybrid"], default="baseline")
    args = parser.parse_args()
    if args.command == "prepare":
        result = prepare(args.cv_dir, args.jobs, args.output, args.count, args.seed, args.source,
                         annotation_provenance=args.annotation_provenance)
    elif args.command == "freeze":
        result = freeze(args.source_kit, args.output, ocr_enabled=args.ocr_enabled,
                        ocr_max_pages=args.ocr_max_pages, ocr_timeout_seconds=args.ocr_timeout_seconds)
    elif args.command == "score":
        result = score(args.kit)
    elif args.command == "status":
        result = status(args.kit)
    else:
        result = evaluate_kit(args.kit, args.split, args.variant)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
