"""Run versioned local comparisons without overwriting a source annotation kit."""
import argparse
from datetime import UTC, datetime
import json
from pathlib import Path
import shutil

from app.evaluation.kit import evaluate_kit, score, status
from app.evaluation.components import export_components
from app.evaluation.semantic import HYBRID_VERSION, MODEL_ID, MODEL_REVISION, run as run_semantic
from app.evaluation.validation import (
    INPUT_SNAPSHOT_PATH, PROVENANCES, annotation_files, annotation_rows, digest,
    input_snapshot_digest, read_manifest,
)
from app.matching.algorithm import ALGORITHM_VERSION


def compare(source: Path, output: Path, *, provenance: str, cache: Path | None = None) -> dict:
    if provenance not in PROVENANCES:
        raise ValueError("Unknown annotation provenance")
    if output.exists():
        raise FileExistsError("Comparison output already exists; select a new run directory")
    manifest = read_manifest(source)
    if manifest.get("annotation_provenance") == "HUMAN_SINGLE_RATER" and provenance != "HUMAN_SINGLE_RATER":
        raise ValueError("A single-rater kit cannot be relabeled as another annotation design")
    manifest["annotation_provenance"] = provenance
    label_files = annotation_files(manifest)
    for name in label_files:
        annotation_rows(source / name, manifest)
    snapshot_hash = input_snapshot_digest(source, manifest)
    artifacts = ("manifest.json", *label_files, *((INPUT_SNAPSHOT_PATH,) if snapshot_hash else ()))
    source_hashes = {name: digest(source / name) for name in artifacts}
    output.mkdir(parents=True)
    for name in label_files:
        shutil.copyfile(source / name, output / name)
    if snapshot_hash:
        target = output / INPUT_SNAPSHOT_PATH
        target.parent.mkdir()
        shutil.copyfile(source / INPUT_SNAPSHOT_PATH, target)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    run: dict[str, object] = {
        "startedAt": datetime.now(UTC).isoformat(), "status": "RUNNING",
        "sourceArtifactsSha256": source_hashes, "annotationProvenance": provenance,
        "baselineVersion": ALGORITHM_VERSION, "hybridVersion": HYBRID_VERSION,
        "modelId": MODEL_ID if cache else None, "modelRevision": MODEL_REVISION if cache else None,
        "localOnly": True, "semanticStatus": "NOT_REQUESTED", "metrics": [],
        "inputMode": "FROZEN_PARSED" if snapshot_hash else "LEGACY_TEXT_ONLY",
        "inputSnapshotSha256": snapshot_hash,
        "componentArtifacts": [],
        "qualityClaim": ("SINGLE_RATER_LIMITATIONS" if provenance == "HUMAN_SINGLE_RATER" else
                         "REQUIRES_PROTOCOL_REVIEW" if provenance == "HUMAN_INDEPENDENT" else "DIAGNOSTIC_ONLY"),
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
        if snapshot_hash:
            components = []
            for variant in variants:
                path = Path("model-only") / f"components-{variant}.json"
                exported = export_components(output, output / path, variant=variant)
                components.append({"variant": variant, "path": path.as_posix(),
                                   "sha256": exported["outputSha256"], "schemaVersion": exported["schemaVersion"]})
            run["componentArtifacts"] = components
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
