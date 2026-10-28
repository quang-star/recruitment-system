"""Run versioned local comparisons without overwriting a source annotation kit."""
import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil

from app.evaluation.kit import evaluate_kit, score, status
from app.evaluation.semantic import HYBRID_VERSION, MODEL_ID, MODEL_REVISION, run as run_semantic
from app.evaluation.validation import LABEL_FILES, annotation_rows, digest, read_manifest
from app.matching.algorithm import ALGORITHM_VERSION


PROVENANCES = ("HUMAN_INDEPENDENT", "MODEL_GENERATED", "UNKNOWN")


def compare(source: Path, output: Path, *, provenance: str, cache: Path | None = None) -> dict:
    if provenance not in PROVENANCES:
        raise ValueError("Unknown annotation provenance")
    if output.exists():
        raise FileExistsError("Comparison output already exists; select a new run directory")
    manifest = read_manifest(source)
    for name in LABEL_FILES:
        annotation_rows(source / name, manifest)
    source_hashes = {name: digest(source / name) for name in ("manifest.json", *LABEL_FILES)}
    output.mkdir(parents=True)
    for name in LABEL_FILES:
        shutil.copyfile(source / name, output / name)
    manifest["annotation_provenance"] = provenance
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    run: dict[str, object] = {
        "startedAt": datetime.now(UTC).isoformat(), "status": "RUNNING",
        "sourceArtifactsSha256": source_hashes, "annotationProvenance": provenance,
        "baselineVersion": ALGORITHM_VERSION, "hybridVersion": HYBRID_VERSION,
        "modelId": MODEL_ID if cache else None, "modelRevision": MODEL_REVISION if cache else None,
        "localOnly": True, "semanticStatus": "NOT_REQUESTED", "metrics": [],
        "qualityClaim": "DIAGNOSTIC_ONLY" if provenance != "HUMAN_INDEPENDENT" else "REQUIRES_PROTOCOL_REVIEW",
    }
    run_path = output / "run.json"

    def save() -> None:
        run_path.write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")

    save()
    try:
        variants = ["baseline"]
        if cache is None:
            score(output)
        else:
            try:
                run_semantic(output, cache, local_only=True)
            except (OSError, ImportError):
                # Missing dependencies/cache do not manufacture semantic scores.
                run["semanticStatus"] = "UNAVAILABLE"
                score(output)
            else:
                run["semanticStatus"] = "COMPLETED"
                variants.extend(("semantic", "hybrid"))
        progress = status(output)
        run["annotationProgress"] = progress["annotations"]
        if progress["readyForMetrics"]:
            metrics = []
            for split, count in progress["splits"].items():
                if count:
                    for variant in variants:
                        evaluate_kit(output, split, variant)
                        metrics.append(f"metrics-{variant}-{split}.json")
            run["metrics"] = metrics
        run["status"] = "COMPLETED" if cache is None or run["semanticStatus"] == "COMPLETED" else "PARTIAL"
        run["manifestSha256"] = digest(output / "manifest.json")
        run["sourceUnchanged"] = all(digest(source / name) == sha for name, sha in source_hashes.items())
        if not run["sourceUnchanged"]:
            raise ValueError("Source annotation kit changed during comparison")
    except Exception:
        run["status"] = "FAILED"
        save()
        raise
    run["finishedAt"] = datetime.now(UTC).isoformat()
    save()
    return run


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-kit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--annotation-provenance", choices=PROVENANCES, required=True)
    parser.add_argument("--cache", type=Path, help="Existing local model cache; downloads are disabled")
    args = parser.parse_args()
    print(json.dumps(compare(args.source_kit, args.output, provenance=args.annotation_provenance,
                             cache=args.cache), ensure_ascii=False))


if __name__ == "__main__":
    main()
