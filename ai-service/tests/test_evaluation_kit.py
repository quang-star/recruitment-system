import csv
import json
from pathlib import Path

import pytest

from app.evaluation.kit import _csv, _labels, evaluate_kit, prepare, score, status
from app.evaluation.validation import LABEL_FILES, read_manifest, record_predictions


def test_kit_keeps_candidate_splits_disjoint_and_labels_blind(tmp_path):
    source = tmp_path / "pdfs"
    source.mkdir()
    for index in range(10):
        (source / f"{index}.pdf").write_bytes(f"fixture-{index}".encode())
    jobs = tmp_path / "jobs.json"
    jobs.write_text(json.dumps([{"id": "java"}, {"id": "react"}]))
    kit = tmp_path / "kit"
    assert prepare(source, jobs, kit, 10, 42)["pairs"] == 20
    manifest = json.loads((kit / "manifest.json").read_text())
    dev = {p["candidate_id"] for p in manifest["pairs"] if p["split"] == "dev"}
    test = {p["candidate_id"] for p in manifest["pairs"] if p["split"] == "test"}
    assert dev and test and dev.isdisjoint(test)
    with (kit / "rater-1.csv").open() as stream:
        rows = list(csv.DictReader(stream))
    assert all(row["label"] == "" and "predicted_score" not in row for row in rows)
    with pytest.raises(ValueError, match="Complete independent labels"):
        evaluate_kit(kit, "test")
    with pytest.raises(FileExistsError):
        prepare(source, jobs, kit, 10, 42)
    # Changed source files cannot silently change the inputs used for scoring.
    Path(manifest["cvs"][0]["path"]).write_bytes(b"changed")
    with pytest.raises(ValueError, match="Source PDF changed"):
        score(kit)


def test_labels_reject_duplicate_pairs(tmp_path):
    path = tmp_path / "labels.csv"
    path.write_text("pair_id,label,reason\na,3,evidence\na,2,evidence\n")
    with pytest.raises(ValueError, match="duplicate"):
        _labels(path, {"a", "b"})


@pytest.fixture
def ready_kit(tmp_path):
    """Synthetic test labels only, never used as research observations."""
    source = tmp_path / "pdfs"
    source.mkdir()
    for index in range(4):
        (source / f"{index}.pdf").write_bytes(f"fixture-{index}".encode())
    jobs = tmp_path / "jobs.json"
    jobs.write_text(json.dumps([{"id": "java"}, {"id": "react"}]))
    kit = tmp_path / "kit"
    prepare(source, jobs, kit, 4, 42)
    manifest = read_manifest(kit)
    for name in LABEL_FILES:
        with (kit / name).open() as stream:
            rows = list(csv.DictReader(stream))
        for row in rows:
            row.update(label="3", reason="Synthetic fixture evidence")
        _csv(kit / name, rows, list(rows[0]))
    (kit / "model-only").mkdir()
    _csv(kit / "model-only" / "predictions.csv",
         [{"pair_id": pair["pair_id"], "predicted_score": 75, "algorithm_version": "fixture-v1"}
          for pair in manifest["pairs"]], ["pair_id", "predicted_score", "algorithm_version"])
    record_predictions(kit, "baseline")
    return kit


def test_metrics_are_split_specific_and_traceable_without_changing_labels(ready_kit):
    before = {name: (ready_kit / name).read_bytes() for name in LABEL_FILES}
    progress = status(ready_kit)
    assert progress["readyForMetrics"] is True
    assert progress["splits"] == {"dev": 2, "test": 6}
    result = evaluate_kit(ready_kit, "test")
    assert result["pairCount"] == 6
    assert result["scoreMetrics"]["maeOnLabelScale0To4"] == 0
    assert len(result["manifestSha256"]) == 64
    assert set(result["annotationSha256"]) == set(LABEL_FILES)
    assert "ANONYMIZATION_NOT_VERIFIED" in result["warnings"]
    assert before == {name: (ready_kit / name).read_bytes() for name in LABEL_FILES}
    assert "fixture evidence" not in json.dumps(progress).lower()


@pytest.mark.parametrize("change,message", [
    ("pdf", "Duplicate PDF"), ("split", "CV split"),
    ("pair", "Duplicate candidate/job"), ("reference", "unknown CV"),
])
def test_manifest_rejects_duplicate_content_leakage_and_invalid_pairs(ready_kit, change, message):
    path = ready_kit / "manifest.json"
    manifest = json.loads(path.read_text())
    if change == "pdf":
        manifest["cvs"][1]["sha256"] = manifest["cvs"][0]["sha256"]
    elif change == "split":
        manifest["pairs"][0]["split"] = "test"
    elif change == "pair":
        manifest["pairs"].append({**manifest["pairs"][0], "pair_id": "different-id"})
    else:
        manifest["pairs"][0]["candidate_id"] = "unknown"
    path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match=message):
        evaluate_kit(ready_kit, "test")


@pytest.mark.parametrize("target", ["manifest.json", "model-only/predictions.csv"])
def test_changed_inputs_or_predictions_cannot_produce_metrics(ready_kit, target):
    path = ready_kit / target
    path.write_bytes(path.read_bytes() + b"\n")
    with pytest.raises(ValueError, match="Stale or changed"):
        evaluate_kit(ready_kit, "test")
    assert status(ready_kit)["readyForMetrics"] is False


def test_legacy_predictions_require_rescoring_and_incomplete_labels_block_metrics(ready_kit):
    (ready_kit / "model-only" / "predictions.metadata.json").unlink()
    with pytest.raises(ValueError, match="provenance missing"):
        evaluate_kit(ready_kit, "test")
    record_predictions(ready_kit, "baseline")
    path = ready_kit / "rater-2.csv"
    path.write_text(path.read_text().replace(",3,Synthetic fixture evidence", ",,", 1))
    assert status(ready_kit)["annotations"]["rater-2.csv"]["remaining"] == 1
    with pytest.raises(ValueError, match="Complete independent labels"):
        evaluate_kit(ready_kit, "test")


@pytest.mark.parametrize("bad_value", ["nan", "inf", "-1", "101"])
def test_invalid_scores_rejected_even_outside_selected_split(ready_kit, bad_value):
    path = ready_kit / "model-only" / "predictions.csv"
    path.write_text(path.read_text().replace(",75,", f",{bad_value},", 1))
    record_predictions(ready_kit, "baseline")
    with pytest.raises(ValueError, match="finite and between"):
        evaluate_kit(ready_kit, "test")


def test_mixed_algorithm_versions_and_changed_annotation_metadata_rejected(ready_kit):
    path = ready_kit / "model-only" / "predictions.csv"
    original = path.read_text()
    path.write_text(original.replace("fixture-v1", "fixture-v2", 1))
    record_predictions(ready_kit, "baseline")
    with pytest.raises(ValueError, match="one nonempty algorithm"):
        evaluate_kit(ready_kit, "test")
    path.write_text(original)
    record_predictions(ready_kit, "baseline")
    labels = ready_kit / "rater-1.csv"
    labels.write_text(labels.read_text().replace(",dev,", ",test,", 1))
    with pytest.raises(ValueError, match="metadata differs"):
        evaluate_kit(ready_kit, "test")


def test_prepare_rejects_identical_pdfs_before_creating_output(tmp_path):
    source = tmp_path / "pdfs"
    source.mkdir()
    for name in ("first.pdf", "copy.pdf"):
        (source / name).write_bytes(b"same PDF")
    jobs = tmp_path / "jobs.json"
    jobs.write_text('[{"id":"java"}]')
    with pytest.raises(ValueError, match="Duplicate PDF"):
        prepare(source, jobs, tmp_path / "kit", 2, 42)
    assert not (tmp_path / "kit").exists()


@pytest.mark.parametrize("provenance,warning", [
    ("MODEL_GENERATED", "MODEL_GENERATED_REFERENCE_LABELS"),
    ("UNKNOWN", "LABEL_PROVENANCE_UNVERIFIED"),
])
def test_diagnostic_labels_do_not_claim_human_agreement(ready_kit, provenance, warning):
    path = ready_kit / "manifest.json"
    manifest = read_manifest(ready_kit)
    manifest["annotation_provenance"] = provenance
    path.write_text(json.dumps(manifest))
    record_predictions(ready_kit, "baseline")
    result = evaluate_kit(ready_kit, "test")
    assert result["annotationProvenance"] == provenance
    assert result["interRaterAgreement"] is None
    assert warning in result["warnings"]


def test_declared_human_labels_preserve_agreement(ready_kit):
    path = ready_kit / "manifest.json"
    manifest = read_manifest(ready_kit)
    manifest["annotation_provenance"] = "HUMAN_INDEPENDENT"
    path.write_text(json.dumps(manifest))
    record_predictions(ready_kit, "baseline")
    result = evaluate_kit(ready_kit, "test")
    assert result["interRaterAgreement"]["rawAgreement"] == 1
    assert "LABEL_PROVENANCE_UNVERIFIED" not in result["warnings"]
