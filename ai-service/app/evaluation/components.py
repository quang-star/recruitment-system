"""Export numeric matching components for error analysis, outside the blind kit."""
import argparse
import json
from pathlib import Path
import re

from app.evaluation.inputs import load_frozen_inputs
from app.evaluation.semantic import (
    HYBRID_VERSION, MISSING_TEXT_POLICY, MODEL_ID, MODEL_REVISION, SEMANTIC_VERSION, SEMANTIC_WEIGHT, blend,
)
from app.evaluation.validation import INPUT_SNAPSHOT_PATH, VARIANTS, digest, prediction_path, read_predictions
from app.matching.algorithm import ALGORITHM_VERSION, compute_match


def _semantic_context(kit: Path, manifest: dict, cvs: dict, jobs: dict) -> tuple[dict, dict, set[str]]:
    metadata = json.loads((kit / "model-only/experiment.json").read_text(encoding="utf-8"))
    if not isinstance(metadata, dict):
        raise ValueError("Semantic experiment metadata must be an object")
    expected = {"model": MODEL_ID, "revision": MODEL_REVISION, "semanticWeight": SEMANTIC_WEIGHT,
                "manifestSha256": digest(kit / "manifest.json"),
                "inputSnapshotSha256": manifest["inputSnapshot"]["sha256"],
                "asOfMonth": manifest["as_of_month"], "inputMode": "FROZEN_PARSED",
                "pairs": len(manifest["pairs"]), "missingTextPolicy": MISSING_TEXT_POLICY,
                "implementationSha256": {
                    "semantic": digest(Path(__file__).with_name("semantic.py")),
                    "baseline": digest(Path(__file__).resolve().parents[1] / "matching/algorithm.py")}}
    if any(metadata.get(name) != value for name, value in expected.items()):
        raise ValueError("Semantic experiment metadata differs from frozen inputs or method")
    chunks = metadata.get("chunkCounts")
    if (not isinstance(chunks, list) or len(chunks) != len(cvs) + len(jobs)
            or any(type(count) is not int or count < 0 for count in chunks)):
        raise ValueError("Semantic experiment chunk counts are invalid")
    cv_chunks = dict(zip(cvs, chunks[:len(cvs)]))
    jd_chunks = dict(zip(jobs, chunks[len(cvs):]))
    missing = {pair["pair_id"] for pair in manifest["pairs"]
               if not cv_chunks[pair["candidate_id"]] or not jd_chunks[pair["job_id"]]}
    recorded = metadata.get("missingTextPairs")
    if (not isinstance(recorded, list) or any(not isinstance(pair, str) for pair in recorded)
            or len(recorded) != len(missing) or set(recorded) != missing):
        raise ValueError("Semantic missing-text pairs differ from chunk counts")
    predictions = {}
    for variant, version in (("semantic", SEMANTIC_VERSION), ("hybrid", HYBRID_VERSION)):
        rows = read_predictions(kit, manifest, variant)
        if any(row["algorithm_version"] != version for row in rows):
            raise ValueError("Semantic or hybrid prediction algorithm version differs")
        predictions[variant] = {row["pair_id"]: row for row in rows}
    return metadata, predictions, missing


def _method_component(name: str, weight: float, score: float | None) -> dict:
    return {"name": name, "weight": weight, "score": None if score is None else score / 100,
            "contribution": 0.0 if score is None else round(weight * score / 100, 6)}


def export_components(kit: Path, output: Path, *, variant: str = "baseline") -> dict:
    if variant not in VARIANTS:
        raise ValueError("Unknown component variant")
    private = kit / "model-only"
    if (private.is_symlink() or output.parent.resolve() != private.resolve()
            or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*\.json", output.name) is None):
        raise ValueError("Keep component JSON in the kit's model-only directory")
    if output.exists():
        raise FileExistsError("Component output already exists; select a new file")
    manifest, cvs, jobs, snapshot = load_frozen_inputs(kit)
    paths = {
        "manifestSha256": kit / "manifest.json",
        "inputSnapshotSha256": kit / INPUT_SNAPSHOT_PATH,
        "predictionsSha256": prediction_path(kit, "baseline"),
        "predictionMetadataSha256": prediction_path(kit, "baseline").with_suffix(".metadata.json"),
        "algorithmSha256": Path(__file__).resolve().parents[1] / "matching/algorithm.py",
        "exporterSha256": Path(__file__),
    }
    if variant != "baseline":
        paths.update({"experimentSha256": private / "experiment.json",
                      "semanticImplementationSha256": Path(__file__).with_name("semantic.py")})
        for method in ("semantic", "hybrid"):
            path = prediction_path(kit, method)
            paths[method + "PredictionsSha256"] = path
            paths[method + "PredictionMetadataSha256"] = path.with_suffix(".metadata.json")
    hashes = {name: digest(path) for name, path in paths.items()}
    predictions = {row["pair_id"]: row for row in read_predictions(kit, manifest, "baseline")}
    metadata, method_predictions, missing = (_semantic_context(kit, manifest, cvs, jobs)
                                             if variant != "baseline" else ({}, {}, set()))
    rows = []
    for pair in manifest["pairs"]:
        result = compute_match(cvs[pair["candidate_id"]], jobs[pair["job_id"]],
                               as_of_month=manifest["as_of_month"])
        prediction = predictions[pair["pair_id"]]
        if (prediction["algorithm_version"] != ALGORITHM_VERSION
                or float(prediction["predicted_score"]) != result.final_score):
            raise ValueError("Baseline predictions differ from current frozen component calculation")
        # Details, claims and evidence can contain professional/personal source
        # text. Only the numeric breakdown and controlled quality codes leave it.
        components = [{name: component[name] for name in ("name", "weight", "score", "contribution")}
                      for component in result.components]
        identity = {name: pair[name] for name in ("pair_id", "candidate_id", "job_id", "split")}
        row = {**identity, "finalScore": result.final_score, "penalty": result.penalty,
               "penaltyVersion": result.penalty_version, "confidence": result.confidence,
               "status": result.status, "qualityFlags": result.quality_flags, "components": components}
        if variant != "baseline":
            pair_id = pair["pair_id"]
            semantic = float(method_predictions["semantic"][pair_id]["predicted_score"])
            hybrid = float(method_predictions["hybrid"][pair_id]["predicted_score"])
            unavailable = pair_id in missing
            if (unavailable and semantic != 0
                    or hybrid != blend(result.final_score, None if unavailable else semantic)):
                raise ValueError("Semantic or hybrid predictions differ from declared combination or fallback")
            semantic_score = None if unavailable else semantic
            row["semanticAvailable"] = not unavailable
            if variant == "semantic":
                row.update(finalScore=semantic, status="UNAVAILABLE" if unavailable else "COMPLETED",
                           qualityFlags=["SEMANTIC_TEXT_UNAVAILABLE"] if unavailable else [],
                           components=[_method_component("SEMANTIC", 100, semantic_score)])
            else:
                row.update(finalScore=hybrid, baselineComponents=components,
                           status="BASELINE_FALLBACK" if unavailable else result.status,
                           qualityFlags=result.quality_flags + (["SEMANTIC_TEXT_UNAVAILABLE"] if unavailable else []),
                           components=[_method_component("BASELINE", 100 if unavailable else 100 * (1 - SEMANTIC_WEIGHT), result.final_score),
                                       _method_component("SEMANTIC", 0 if unavailable else 100 * SEMANTIC_WEIGHT, semantic_score)])
        rows.append(row)
    if any(digest(path) != hashes[name] for name, path in paths.items()):
        raise ValueError("Component inputs changed during export")
    exported = {
        "schemaVersion": "matching-components/1.0" if variant == "baseline" else "matching-components/1.1",
        "variant": variant,
        "algorithmVersion": {"baseline": ALGORITHM_VERSION, "semantic": SEMANTIC_VERSION,
                             "hybrid": HYBRID_VERSION}[variant], "asOfMonth": manifest["as_of_month"],
        "sourceManifestSha256": snapshot["sourceManifestSha256"], **hashes,
        "annotationProvenance": manifest.get("annotation_provenance", "UNKNOWN"),
        "pairCount": len(rows), "pairs": rows,
        "scoreDefinition": "0-100 weighted baseline score; not a recruitment probability" if variant == "baseline"
                           else "0-100 research score; method contributions are points, not a recruitment probability",
        "privacy": "Private model output. No raw text/details/claims; IDs are not guaranteed anonymous. Keep blind raters separate.",
        "limitations": (["BASELINE_COMPONENTS_ONLY"] if variant == "baseline" else
                        ["UNCALIBRATED_SEMANTIC_SIMILARITY", "SEMANTIC_NOT_DECOMPOSED_BY_SKILL"])
                       + ["NO_HUMAN_QUALITY_EVALUATION_PERFORMED"],
    }
    if variant != "baseline":
        exported.update(modelId=metadata["model"], modelRevision=metadata["revision"],
                        semanticWeight=metadata["semanticWeight"], missingTextPolicy=MISSING_TEXT_POLICY)
    if variant == "hybrid":
        exported["baselineComponentsDefinition"] = "Baseline diagnostics only; hybrid points use the method components"
    with output.open("x", encoding="utf-8") as stream:
        json.dump(exported, stream, ensure_ascii=False, indent=2, allow_nan=False)
    return {"pairCount": len(rows), "schemaVersion": exported["schemaVersion"],
            "outputSha256": digest(output), "variant": variant}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--variant", choices=sorted(VARIANTS), default="baseline")
    args = parser.parse_args()
    print(json.dumps(export_components(args.kit, args.output, variant=args.variant)))


if __name__ == "__main__":
    main()
