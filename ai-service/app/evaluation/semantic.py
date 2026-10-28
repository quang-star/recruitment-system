"""Local research comparison. Does not change production matching or human labels."""
import argparse
import hashlib
from importlib.metadata import version
import json
import math
from pathlib import Path

from app.evaluation.kit import _csv, load_inputs
from app.evaluation.validation import record_predictions
from app.matching.algorithm import ALGORITHM_VERSION, compute_match

MODEL_ID = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
MODEL_REVISION = "e8f8c211226b894fcb81acc59f3b34ba3efd5f42"
SEMANTIC_VERSION = "minilm-mean-chunks-v1"
HYBRID_VERSION = "hybrid-baseline-v5-minilm-v1"
SEMANTIC_WEIGHT = 0.2  # Prespecified research hypothesis, not tuned on test labels.


def cv_text(payload: dict) -> str:
    # Only job-related fields; omit names, contact, employer and school names.
    parts = [str(s.get("raw", "")) for s in payload.get("skills", [])
             if s.get("provenance") != "USER_ASSERTED"]
    for job in payload.get("experiences", []):
        parts.append(str(job.get("titleRaw", "")))
        parts.extend(str(s) for s in job.get("responsibilities", []))
    return "\n".join(part for part in parts if part.strip())


def jd_text(payload: dict) -> str:
    parts = [str(payload.get("title", {}).get("raw", ""))]
    requirements = payload.get("requirements", {})
    for field in ("requiredSkills", "preferredSkills", "education", "languages"):
        parts.extend(str(item.get("raw", "")) for item in requirements.get(field, []))
    parts.extend(str(item.get("raw", "")) for item in payload.get("responsibilities", []))
    return "\n".join(part for part in parts if part.strip())


def blend(baseline: float, semantic: float | None) -> float:
    if not math.isfinite(baseline) or not 0 <= baseline <= 100:
        raise ValueError("Baseline score must be finite and between 0 and 100")
    if semantic is None:
        return baseline
    if not math.isfinite(semantic) or not 0 <= semantic <= 100:
        raise ValueError("Semantic score must be finite and between 0 and 100")
    return round((1 - SEMANTIC_WEIGHT) * baseline + SEMANTIC_WEIGHT * semantic, 2)


def embed_documents(model, texts):
    import numpy as np

    vectors = []
    chunk_counts = []
    # Token windows avoid silently losing all text after the model's 128-token limit.
    size = model.max_seq_length - model.tokenizer.num_special_tokens_to_add(pair=False)
    if size <= 0:
        raise ValueError("Invalid model token limit")
    for text in texts:
        tokens = model.tokenizer.encode(text, add_special_tokens=False, verbose=False)
        chunks = [model.tokenizer.decode(tokens[i:i + size], skip_special_tokens=True)
                  for i in range(0, len(tokens), size)]
        chunk_counts.append(len(chunks))
        if not chunks:
            vectors.append(None)
            continue
        encoded = model.encode(chunks, batch_size=16, normalize_embeddings=True,
                               show_progress_bar=False, convert_to_numpy=True)
        vector = np.mean(encoded, axis=0)
        norm = np.linalg.norm(vector)
        if not np.isfinite(norm) or norm == 0:
            raise ValueError("Model produced an invalid embedding")
        vectors.append(vector / norm)
    return vectors, chunk_counts


def load_embedding_model(cache: Path, *, local_only: bool):
    from sentence_transformers import SentenceTransformer

    model_path = MODEL_ID
    if local_only:
        from huggingface_hub import snapshot_download

        # Resolve the pinned snapshot first. Passing its local path also keeps
        # tokenizer internals from attempting Hub authentication or metadata reads.
        model_path = snapshot_download(MODEL_ID, revision=MODEL_REVISION,
                                       cache_dir=str(cache), local_files_only=True, token=False)
    model = SentenceTransformer(model_path, revision=MODEL_REVISION, device="cpu",
                                cache_folder=str(cache), local_files_only=local_only,
                                trust_remote_code=False, token=False)
    model.eval()
    return model


def run(kit: Path, cache: Path, local_only: bool = False):
    manifest, cvs, jobs = load_inputs(kit)
    model = load_embedding_model(cache, local_only=local_only)
    cv_ids, job_ids = list(cvs), list(jobs)
    texts = [cv_text(cvs[key]) for key in cv_ids] + [jd_text(jobs[key]) for key in job_ids]
    vectors, counts = embed_documents(model, texts)
    cv_vectors = dict(zip(cv_ids, vectors[:len(cv_ids)]))
    job_vectors = dict(zip(job_ids, vectors[len(cv_ids):]))
    rows: dict[str, list[dict[str, object]]] = {name: [] for name in ("baseline", "semantic", "hybrid")}
    missing = []
    for pair in manifest["pairs"]:
        candidate, job = pair["candidate_id"], pair["job_id"]
        baseline = compute_match(cvs[candidate], jobs[job], as_of_month=manifest["as_of_month"]).final_score
        left, right = cv_vectors[candidate], job_vectors[job]
        semantic = None if left is None or right is None else round(max(0., min(1., float(left @ right))) * 100, 2)
        if semantic is None:
            missing.append(pair["pair_id"])
        for name, score, algorithm in (
            ("baseline", baseline, ALGORITHM_VERSION),
            ("semantic", semantic if semantic is not None else 0., SEMANTIC_VERSION),
            ("hybrid", blend(baseline, semantic), HYBRID_VERSION),
        ):
            rows[name].append({"pair_id": pair["pair_id"], "predicted_score": score,
                               "algorithm_version": algorithm})
    output = kit / "model-only"
    output.mkdir(exist_ok=True)
    for name, values in rows.items():
        filename = "predictions.csv" if name == "baseline" else f"predictions-{name}.csv"
        _csv(output / filename, values, ["pair_id", "predicted_score", "algorithm_version"])
        record_predictions(kit, name)
    comparison = [{**pair, **{name: rows[name][index]["predicted_score"] for name in rows},
                   "missing_text": pair["pair_id"] in missing}
                  for index, pair in enumerate(manifest["pairs"])]
    _csv(output / "comparison.csv", comparison,
         ["pair_id", "candidate_id", "job_id", "split", "baseline", "semantic", "hybrid", "missing_text"])
    metadata = {"model": MODEL_ID, "revision": MODEL_REVISION, "semanticWeight": SEMANTIC_WEIGHT,
                "versions": {p: version(p) for p in ("sentence-transformers", "torch", "transformers", "numpy")},
                "asOfMonth": manifest["as_of_month"], "manifestSha256": hashlib.sha256((kit / "manifest.json").read_bytes()).hexdigest(),
                "chunkCounts": counts, "missingTextPairs": missing,
                "missingTextPolicy": "semantic=0; hybrid=baseline", "pairs": len(manifest["pairs"]),
                "limitation": "Uncalibrated cosine similarity; not a probability or validated hiring score. No human-label metrics yet."}
    (output / "experiment.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return {"pairs": len(manifest["pairs"]), "variants": list(rows), "missingTextPairs": len(missing)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kit", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--local-only", action="store_true")
    args = parser.parse_args()
    print(json.dumps(run(args.kit, args.cache, args.local_only)))


if __name__ == "__main__":
    main()
