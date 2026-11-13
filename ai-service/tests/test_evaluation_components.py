"""Synthetic component export regressions; no model, provider or human observations."""
import csv
import json

import pytest

from app.evaluation import comparison, components, semantic
from app.evaluation.kit import _csv
from app.evaluation.validation import digest, record_predictions
import test_evaluation_inputs as fixtures

source_kit = fixtures.source_kit
fake_ocr = fixtures.fake_ocr
frozen_kit = fixtures.frozen_kit


def run_semantic(kit, tmp_path, monkeypatch, *, missing=False):
    class Vector:
        def __matmul__(self, other):
            return 0.5

    def embeddings(model, texts):
        vectors = [Vector() for _ in texts]
        counts = [1 for _ in texts]
        if missing:
            vectors[0], counts[0] = None, 0
        return vectors, counts

    monkeypatch.setattr(semantic, "load_embedding_model", lambda *args, **kwargs: object())
    monkeypatch.setattr(semantic, "embed_documents", embeddings)
    monkeypatch.setattr(semantic, "version", lambda name: "synthetic-test")
    semantic.run(kit, tmp_path / "not-a-real-model", local_only=True)


@pytest.mark.parametrize("variant", ["semantic", "hybrid"])
@pytest.mark.parametrize("missing", [False, True])
def test_method_components_reconstruct_saved_scores_without_model_or_private_source(
        frozen_kit, tmp_path, monkeypatch, variant, missing):
    run_semantic(frozen_kit, tmp_path, monkeypatch, missing=missing)
    labels_before = digest(frozen_kit / "rater-1.csv")
    fixtures.forbid_raw_input(monkeypatch)

    def forbidden(*args, **kwargs):
        pytest.fail("Export must not initialize a model or re-embed documents")

    monkeypatch.setattr(semantic, "load_embedding_model", forbidden)
    monkeypatch.setattr(semantic, "embed_documents", forbidden)
    output = frozen_kit / f"model-only/{variant}-components.json"
    summary = components.export_components(frozen_kit, output, variant=variant)
    exported = json.loads(output.read_text(encoding="utf-8"))
    assert summary["schemaVersion"] == "matching-components/1.1"
    assert summary["variant"] == variant
    assert exported["experimentSha256"] == digest(frozen_kit / "model-only/experiment.json")
    assert exported["modelRevision"] == semantic.MODEL_REVISION
    assert exported["pairCount"] == 4
    unavailable = [row for row in exported["pairs"] if not row["semanticAvailable"]]
    assert len(unavailable) == (2 if missing else 0)
    with (frozen_kit / f"model-only/predictions-{variant}.csv").open(encoding="utf-8") as stream:
        predictions = {row["pair_id"]: float(row["predicted_score"]) for row in csv.DictReader(stream)}
    for row in exported["pairs"]:
        assert row["finalScore"] == predictions[row["pair_id"]]
        assert round(sum(part["contribution"] for part in row["components"]), 2) == row["finalScore"]
        if variant == "hybrid":
            assert [part["weight"] for part in row["components"]] == (
                [80, 20] if row["semanticAvailable"] else [100, 0])
            assert len(row["baselineComponents"]) == 6
            if not row["semanticAvailable"]:
                assert row["status"] == "BASELINE_FALLBACK"
                assert row["components"][1]["score"] is None
        elif not row["semanticAvailable"]:
            assert row["status"] == "UNAVAILABLE"
            assert row["components"][0]["score"] is None and row["finalScore"] == 0
    assert digest(frozen_kit / "rater-1.csv") == labels_before
    assert "Synthetic regression label" not in output.read_text(encoding="utf-8")
    assert "Build reliable Java services" not in output.read_text(encoding="utf-8")
    with pytest.raises(FileExistsError):
        components.export_components(frozen_kit, output, variant=variant)


@pytest.mark.parametrize("field,value", [
    ("model", "another-model"), ("revision", "another-revision"), ("semanticWeight", 0.3),
    ("manifestSha256", "a" * 64), ("inputSnapshotSha256", "b" * 64),
    ("asOfMonth", "2030-01"), ("inputMode", "LEGACY_TEXT_ONLY"), ("pairs", 3),
    ("missingTextPolicy", "invented-policy"),
    ("chunkCounts", [True, 1, 1, 1]), ("chunkCounts", [-1, 1, 1, 1]),
    ("chunkCounts", [1]), ("missingTextPairs", ["unexpected-pair"]),
    ("missingTextPairs", [[], []]),
    ("implementationSha256", None),
    ("implementationSha256", {"baseline": "a" * 64, "semantic": "b" * 64}),
])
def test_changed_experiment_metadata_is_rejected(frozen_kit, tmp_path, monkeypatch, field, value):
    run_semantic(frozen_kit, tmp_path, monkeypatch)
    path = frozen_kit / "model-only/experiment.json"
    experiment = json.loads(path.read_text(encoding="utf-8"))
    experiment[field] = value
    path.write_text(json.dumps(experiment), encoding="utf-8")
    output = frozen_kit / "model-only/hybrid-components.json"
    with pytest.raises(ValueError, match="Semantic"):
        components.export_components(frozen_kit, output, variant="hybrid")
    assert not output.exists()


@pytest.mark.parametrize("variant,field,value", [
    ("semantic", "predicted_score", "70"),
    ("hybrid", "predicted_score", "1"),
    ("semantic", "algorithm_version", "another-version"),
    ("hybrid", "algorithm_version", "another-version"),
])
def test_prediction_consistency_and_version_are_checked_after_resealing(
        frozen_kit, tmp_path, monkeypatch, variant, field, value):
    run_semantic(frozen_kit, tmp_path, monkeypatch)
    path = frozen_kit / f"model-only/predictions-{variant}.csv"
    with path.open(encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        row[field] = value
    _csv(path, rows, list(rows[0]))
    record_predictions(frozen_kit, variant)
    output = frozen_kit / "model-only/hybrid-components.json"
    with pytest.raises(ValueError, match="differ"):
        components.export_components(frozen_kit, output, variant="hybrid")
    assert not output.exists()


def test_nonzero_semantic_placeholder_cannot_be_reported_as_missing(frozen_kit, tmp_path, monkeypatch):
    run_semantic(frozen_kit, tmp_path, monkeypatch, missing=True)
    path = frozen_kit / "model-only/predictions-semantic.csv"
    with path.open(encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        if row["predicted_score"] == "0.0":
            row["predicted_score"] = "50"
    _csv(path, rows, list(rows[0]))
    record_predictions(frozen_kit, "semantic")
    output = frozen_kit / "model-only/missing-components.json"
    with pytest.raises(ValueError, match="fallback"):
        components.export_components(frozen_kit, output, variant="hybrid")
    assert not output.exists()


def test_experiment_drift_during_export_is_rejected(frozen_kit, tmp_path, monkeypatch):
    run_semantic(frozen_kit, tmp_path, monkeypatch)
    original = components.compute_match

    def changed(*args, **kwargs):
        result = original(*args, **kwargs)
        path = frozen_kit / "model-only/experiment.json"
        path.write_text(path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        return result

    monkeypatch.setattr(components, "compute_match", changed)
    output = frozen_kit / "model-only/drift-components.json"
    with pytest.raises(ValueError, match="changed during export"):
        components.export_components(frozen_kit, output, variant="semantic")
    assert not output.exists()


def test_frozen_comparison_records_component_files_and_hashes(frozen_kit, tmp_path, monkeypatch):
    run_semantic(frozen_kit, tmp_path, monkeypatch)
    fixtures.forbid_raw_input(monkeypatch)
    before = {name: digest(frozen_kit / name) for name in ("manifest.json", "rater-1.csv", "model-only/inputs.json")}
    output = tmp_path / "comparison-with-components"
    result = comparison.compare(frozen_kit, output, provenance="HUMAN_SINGLE_RATER", cache=tmp_path / "fake-cache")
    assert {artifact["variant"] for artifact in result["componentArtifacts"]} == {"baseline", "semantic", "hybrid"}
    for artifact in result["componentArtifacts"]:
        assert artifact["path"].startswith("model-only/")
        assert digest(output / artifact["path"]) == artifact["sha256"]
    assert result["sourceUnchanged"] is True
    assert before == {name: digest(frozen_kit / name) for name in before}


def test_component_failure_marks_comparison_failed_without_private_error(frozen_kit, tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise ValueError("PRIVATE_FAILURE_MARKER")

    monkeypatch.setattr(comparison, "export_components", fail)
    output = tmp_path / "failed-components-run"
    with pytest.raises(ValueError):
        comparison.compare(frozen_kit, output, provenance="HUMAN_SINGLE_RATER")
    record = (output / "run.json").read_text(encoding="utf-8")
    assert json.loads(record)["status"] == "FAILED"
    assert "PRIVATE_FAILURE_MARKER" not in record


def test_unavailable_model_comparison_exports_only_real_baseline_components(frozen_kit, tmp_path, monkeypatch):
    fixtures.forbid_raw_input(monkeypatch)

    def unavailable(*args, **kwargs):
        raise OSError("No local model")

    monkeypatch.setattr(comparison, "run_semantic", unavailable)
    output = tmp_path / "baseline-only-components"
    result = comparison.compare(frozen_kit, output, provenance="HUMAN_SINGLE_RATER", cache=tmp_path / "fake-cache")
    assert result["status"] == "PARTIAL"
    assert [artifact["variant"] for artifact in result["componentArtifacts"]] == ["baseline"]
    assert not (output / "model-only/components-semantic.json").exists()
    assert not (output / "model-only/components-hybrid.json").exists()


@pytest.mark.parametrize("metadata", [None, [], "not-an-object"])
def test_malformed_experiment_root_has_a_safe_validation_error(frozen_kit, tmp_path, monkeypatch, metadata):
    run_semantic(frozen_kit, tmp_path, monkeypatch)
    (frozen_kit / "model-only/experiment.json").write_text(json.dumps(metadata), encoding="utf-8")
    output = frozen_kit / "model-only/malformed-components.json"
    with pytest.raises(ValueError, match="Semantic experiment metadata"):
        components.export_components(frozen_kit, output, variant="semantic")
    assert not output.exists()


def test_export_variant_cli_is_explicit(frozen_kit, tmp_path, monkeypatch, capsys):
    run_semantic(frozen_kit, tmp_path, monkeypatch)
    output = frozen_kit / "model-only/cli-hybrid.json"
    monkeypatch.setattr("sys.argv", ["components", "--kit", str(frozen_kit), "--output", str(output),
                                    "--variant", "hybrid"])
    components.main()
    assert json.loads(capsys.readouterr().out)["variant"] == "hybrid"
    assert json.loads(output.read_text(encoding="utf-8"))["variant"] == "hybrid"
