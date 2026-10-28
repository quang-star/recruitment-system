import json

import pytest

from app.evaluation import comparison
from app.evaluation.validation import LABEL_FILES, digest, record_predictions
import test_evaluation_kit


ready_kit = test_evaluation_kit.ready_kit


def fake_score(output):
    manifest = json.loads((output / "manifest.json").read_text())
    folder = output / "model-only"
    folder.mkdir(exist_ok=True)
    rows = "pair_id,predicted_score,algorithm_version\n" + "".join(
        f"{pair['pair_id']},75,{comparison.ALGORITHM_VERSION}\n" for pair in manifest["pairs"])
    (folder / "predictions.csv").write_text(rows)
    record_predictions(output, "baseline")


def test_comparison_keeps_historical_predictions_and_annotations(ready_kit, tmp_path, monkeypatch):
    before = {name: digest(ready_kit / name) for name in ("manifest.json", *LABEL_FILES,
                                                       "model-only/predictions.csv")}
    monkeypatch.setattr(comparison, "score", fake_score)
    output = tmp_path / "new-run"
    result = comparison.compare(ready_kit, output, provenance="MODEL_GENERATED")
    assert result["status"] == "COMPLETED"
    assert result["sourceUnchanged"] is True
    assert result["qualityClaim"] == "DIAGNOSTIC_ONLY"
    assert len(result["metrics"]) == 2
    assert before == {name: digest(ready_kit / name) for name in before}
    assert all(digest(ready_kit / name) == digest(output / name) for name in LABEL_FILES)
    metrics = json.loads((output / "metrics-baseline-test.json").read_text())
    assert metrics["algorithmVersions"] == [comparison.ALGORITHM_VERSION]
    assert metrics["interRaterAgreement"] is None
    with pytest.raises(FileExistsError):
        comparison.compare(ready_kit, output, provenance="MODEL_GENERATED")


def test_unavailable_semantic_cache_has_no_fake_predictions(ready_kit, tmp_path, monkeypatch):
    monkeypatch.setattr(comparison, "score", fake_score)

    def unavailable(*args, **kwargs):
        assert kwargs["local_only"] is True
        raise OSError("Missing pinned model")

    monkeypatch.setattr(comparison, "run_semantic", unavailable)
    output = tmp_path / "partial-run"
    result = comparison.compare(ready_kit, output, provenance="UNKNOWN", cache=tmp_path / "cache")
    assert result["status"] == "PARTIAL"
    assert result["semanticStatus"] == "UNAVAILABLE"
    assert not (output / "model-only/predictions-semantic.csv").exists()


def test_scoring_failure_is_recorded_without_private_error_text(ready_kit, tmp_path, monkeypatch):
    def failure(output):
        raise ValueError("private source detail")

    monkeypatch.setattr(comparison, "score", failure)
    output = tmp_path / "failed-run"
    with pytest.raises(ValueError):
        comparison.compare(ready_kit, output, provenance="UNKNOWN")
    record = (output / "run.json").read_text()
    assert json.loads(record)["status"] == "FAILED"
    assert "private source detail" not in record
