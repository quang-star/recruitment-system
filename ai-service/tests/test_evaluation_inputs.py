"""Synthetic regression fixtures only; no CV corpus, paid provider or model download."""
from copy import deepcopy
import csv
from io import BytesIO
import json
from pathlib import Path

from pypdf import PdfWriter
import pytest

from app.evaluation import comparison, inputs, semantic
from app.evaluation.kit import _csv, evaluate_kit, prepare, score, status
from app.evaluation.components import export_components
from app.evaluation.validation import (
    INPUT_SNAPSHOT_PATH, digest, read_manifest,
)


@pytest.fixture
def source_kit(tmp_path):
    pdfs = tmp_path / "pdfs"
    pdfs.mkdir()
    for index, page_count in enumerate((1, 6)):
        writer = PdfWriter()
        for _ in range(page_count):
            writer.add_blank_page(width=595 + index, height=842)
        buffer = BytesIO()
        writer.write(buffer)
        (pdfs / f"synthetic-{index}.pdf").write_bytes(buffer.getvalue())
    jobs = tmp_path / "jobs.json"
    jobs.write_text(json.dumps([
        {"id": "backend", "title": "Backend Developer", "description": "Build reliable Java services",
         "requirements": "Required skills: Java, Kafka"},
        {"id": "frontend", "title": "Frontend Developer", "description": "Build React interfaces",
         "requirements": "Required skills: React, TypeScript"},
    ]), encoding="utf-8")
    kit = tmp_path / "source-kit"
    prepare(pdfs, jobs, kit, 2, 42, annotation_provenance="HUMAN_SINGLE_RATER")
    with (kit / "rater-1.csv").open(encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        row.update(label="3", reason="Synthetic regression label, not research evidence")
    _csv(kit / "rater-1.csv", rows, list(rows[0]))
    return kit


@pytest.fixture
def fake_ocr(monkeypatch):
    calls = []
    parse = inputs.parse_pdf

    def extract(content, pages, max_pages, timeout):
        calls.append((pages, max_pages, timeout))
        return ("Skills\nJava, Kafka\nExperience\nBackend Developer\n2020-01 - Present\n"
                "Build and maintain reliable Java services with Kafka for a software engineering team.\n"
                "Design and test backend application programming interfaces and distributed services.")

    def parse_with_fixture_ocr(*args, **kwargs):
        return parse(*args, **kwargs, ocr_extractor=extract)

    monkeypatch.setattr(inputs, "parse_pdf", parse_with_fixture_ocr)
    return calls


@pytest.fixture
def frozen_kit(source_kit, tmp_path, fake_ocr):
    output = tmp_path / "frozen-kit"
    inputs.freeze(source_kit, output, ocr_enabled=True, ocr_max_pages=3, ocr_timeout_seconds=10)
    return output


def test_component_export_matches_predictions_and_keeps_source_text_private(frozen_kit, monkeypatch):
    from dataclasses import replace
    from app.evaluation import components
    from app.matching.algorithm import compute_match

    score(frozen_kit)
    labels = (frozen_kit / "rater-1.csv").read_bytes()
    forbid_raw_input(monkeypatch)

    def with_private_details(*args, **kwargs):
        result = compute_match(*args, **kwargs)
        return replace(result, claims=[{"label": "PRIVATE_SOURCE_MARKER"}], components=[
            {**component, "details": {"raw": "PRIVATE_SOURCE_MARKER"}} for component in result.components])

    monkeypatch.setattr(components, "compute_match", with_private_details)
    output = frozen_kit / "model-only/components.json"
    summary = export_components(frozen_kit, output)
    exported = json.loads(output.read_text(encoding="utf-8"))
    assert summary["pairCount"] == 4
    assert exported["inputSnapshotSha256"] == digest(frozen_kit / INPUT_SNAPSHOT_PATH)
    assert exported["asOfMonth"] == read_manifest(frozen_kit)["as_of_month"]
    assert exported["variant"] == "baseline"
    assert "PRIVATE_SOURCE_MARKER" not in output.read_text(encoding="utf-8")
    assert "Synthetic regression label" not in output.read_text(encoding="utf-8")
    for pair in exported["pairs"]:
        parts = pair["components"]
        assert len(parts) == 6
        assert all(set(part) == {"name", "score", "weight", "contribution"} for part in parts)
        base_score = round(sum(part["contribution"] for part in parts) / (sum(part["weight"] for part in parts) or 1) * 100, 2)
        expected_score = round(max(0.0, min(100.0, base_score - pair.get("penalty", 0.0))), 2)
        assert pair["finalScore"] == pytest.approx(expected_score, abs=0.01)
    assert labels == (frozen_kit / "rater-1.csv").read_bytes()
    with pytest.raises(FileExistsError):
        export_components(frozen_kit, output)


def test_component_export_requires_frozen_inputs(source_kit):
    with pytest.raises(ValueError, match="frozen"):
        export_components(source_kit, source_kit / "model-only/components.json")


@pytest.mark.parametrize("destination", ["components.json", "model-only/.env.json", "rater-components.json"])
def test_component_export_stays_out_of_blind_annotation_files(frozen_kit, destination):
    with pytest.raises(ValueError, match="model-only"):
        export_components(frozen_kit, frozen_kit / destination)


def test_component_export_rejects_resealed_but_inconsistent_predictions(frozen_kit):
    from app.evaluation.validation import record_predictions

    score(frozen_kit)
    path = frozen_kit / "model-only/predictions.csv"
    with path.open(encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    rows[0]["predicted_score"] = str((float(rows[0]["predicted_score"]) + 1) % 100)
    _csv(path, rows, list(rows[0]))
    record_predictions(frozen_kit, "baseline")
    output = frozen_kit / "model-only/components.json"
    with pytest.raises(ValueError, match="differ"):
        export_components(frozen_kit, output)
    assert not output.exists()


def test_component_export_rejects_other_algorithm_versions(frozen_kit):
    from app.evaluation.validation import record_predictions

    score(frozen_kit)
    path = frozen_kit / "model-only/predictions.csv"
    with path.open(encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        row["algorithm_version"] = "another-baseline"
    _csv(path, rows, list(rows[0]))
    record_predictions(frozen_kit, "baseline")
    output = frozen_kit / "model-only/components.json"
    with pytest.raises(ValueError, match="differ"):
        export_components(frozen_kit, output)
    assert not output.exists()


def test_component_export_rejects_input_drift_during_calculation(frozen_kit, monkeypatch):
    from app.evaluation import components
    from app.matching.algorithm import compute_match

    score(frozen_kit)

    def change_manifest(*args, **kwargs):
        result = compute_match(*args, **kwargs)
        path = frozen_kit / "manifest.json"
        path.write_text(path.read_text(encoding="utf-8") + "\n", encoding="utf-8")
        return result

    monkeypatch.setattr(components, "compute_match", change_manifest)
    output = frozen_kit / "model-only/components.json"
    with pytest.raises(ValueError, match="changed during export"):
        export_components(frozen_kit, output)
    assert not output.exists()


def forbid_raw_input(monkeypatch):
    def fail(*args, **kwargs):
        pytest.fail("Frozen scoring must not parse source documents again")
    monkeypatch.setattr(inputs, "parse_pdf", fail)
    monkeypatch.setattr(inputs, "parse_jd", fail)
    original = Path.read_bytes

    def guarded_read(path):
        if path.suffix.lower() == ".pdf":
            pytest.fail("Frozen scoring must not reopen raw PDFs")
        return original(path)
    monkeypatch.setattr(Path, "read_bytes", guarded_read)


def reseal(kit, payload):
    path = kit / INPUT_SNAPSHOT_PATH
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest = read_manifest(kit)
    manifest["inputSnapshot"]["sha256"] = digest(path)
    (kit / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def test_freeze_records_ocr_settings_lineage_and_preserves_original_labels(source_kit, tmp_path, fake_ocr):
    before = {name: (source_kit / name).read_bytes() for name in ("manifest.json", "rater-1.csv")}
    output = tmp_path / "frozen"
    result = inputs.freeze(source_kit, output, ocr_enabled=True, ocr_max_pages=3, ocr_timeout_seconds=10)
    assert sorted(fake_ocr) == [(1, 3, 10), (6, 3, 10)]
    assert result["extractionMethods"] == {"OCR": 2}
    assert result["sourceUnchanged"] is True
    assert result["anonymizationVerified"] is False
    manifest, cvs, jobs = inputs.load_inputs(output)
    payload = json.loads((output / INPUT_SNAPSHOT_PATH).read_text(encoding="utf-8"))
    assert payload["processing"]["externalProvider"] is None
    assert payload["processing"]["ocrMaxPages"] == 3
    assert payload["processing"]["ocrTimeoutSeconds"] == 10
    assert len(payload["processing"]["taxonomySha256"]) == 64
    assert "cv/parser.py" in payload["processing"]["implementationSha256"]
    assert payload["sourceManifestSha256"] == digest(source_kit / "manifest.json")
    assert payload["asOfMonth"] == manifest["as_of_month"]
    assert len(cvs) == 2 and len(jobs) == 2
    assert (output / "rater-1.csv").read_bytes() == before["rater-1.csv"]
    assert before == {name: (source_kit / name).read_bytes() for name in before}
    assert not (output / "rater-2.csv").exists()
    assert not list(output.glob("*.pdf"))


def test_baseline_semantic_hybrid_reuse_exact_frozen_inputs_without_pdf_access(frozen_kit, monkeypatch, tmp_path):
    manifest, cvs, jobs = inputs.load_inputs(frozen_kit)
    forbid_raw_input(monkeypatch)
    score(frozen_kit)
    before = (frozen_kit / "model-only/predictions.csv").read_bytes()
    seen = []

    class Vector:
        def __matmul__(self, other):
            return 0.5

    def embeddings(model, texts):
        seen.extend(texts)
        return [Vector() for _ in texts], [1 for _ in texts]

    monkeypatch.setattr(semantic, "load_embedding_model", lambda *args, **kwargs: object())
    monkeypatch.setattr(semantic, "embed_documents", embeddings)
    monkeypatch.setattr(semantic, "version", lambda name: "synthetic-test")
    semantic.run(frozen_kit, tmp_path / "no-real-model", local_only=True)
    assert (frozen_kit / "model-only/predictions.csv").read_bytes() == before
    assert seen == [semantic.cv_text(cvs[key]) for key in cvs] + [semantic.jd_text(jobs[key]) for key in jobs]
    for variant, filename in (("baseline", "predictions"), ("semantic", "predictions-semantic"),
                              ("hybrid", "predictions-hybrid")):
        metadata = json.loads((frozen_kit / f"model-only/{filename}.metadata.json").read_text())
        assert metadata["inputSnapshotSha256"] == manifest["inputSnapshot"]["sha256"]
        metric = evaluate_kit(frozen_kit, "test", variant)
        assert metric["inputMode"] == "FROZEN_PARSED"
        assert metric["inputSnapshotSha256"] == manifest["inputSnapshot"]["sha256"]


def test_snapshot_mutation_blocks_loading_predictions_and_metrics(frozen_kit, monkeypatch):
    score(frozen_kit)
    forbid_raw_input(monkeypatch)
    path = frozen_kit / INPUT_SNAPSHOT_PATH
    path.write_bytes(path.read_bytes() + b" ")
    with pytest.raises(ValueError, match="snapshot changed"):
        inputs.load_inputs(frozen_kit)
    assert status(frozen_kit)["readyForMetrics"] is False
    with pytest.raises(ValueError, match="snapshot changed"):
        evaluate_kit(frozen_kit, "test")


@pytest.mark.parametrize("change", ["month", "job", "cv_hash"])
def test_frozen_snapshot_cannot_be_reused_for_a_different_dataset(frozen_kit, change):
    manifest = read_manifest(frozen_kit)
    if change == "month":
        manifest["as_of_month"] = "2030-01"
    elif change == "job":
        manifest["jobs"][0]["requirements"] += ", Python"
    else:
        manifest["cvs"][0]["sha256"] = "b" * 64
    (frozen_kit / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="snapshot does not match the dataset"):
        inputs.load_inputs(frozen_kit)


@pytest.mark.parametrize("change", ["ids", "schema", "source_hash"])
def test_resealed_but_invalid_payloads_are_rejected(frozen_kit, change):
    payload = json.loads((frozen_kit / INPUT_SNAPSHOT_PATH).read_text(encoding="utf-8"))
    first = next(iter(payload["cvs"]))
    if change == "ids":
        payload["cvs"]["unexpected"] = deepcopy(payload["cvs"][first])
    elif change == "schema":
        del payload["cvs"][first]["skills"]
    else:
        payload["cvs"][first]["document"]["sourceHash"] = "b" * 64
    reseal(frozen_kit, payload)
    with pytest.raises(ValueError, match="Frozen"):
        inputs.load_inputs(frozen_kit)


@pytest.mark.parametrize("path", ["../../.env", "/absolute/inputs.json", "other.json"])
def test_snapshot_pointer_cannot_read_arbitrary_files(frozen_kit, path):
    manifest = read_manifest(frozen_kit)
    manifest["inputSnapshot"]["path"] = path
    (frozen_kit / "manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="snapshot reference"):
        inputs.load_inputs(frozen_kit)


def test_comparison_copies_snapshot_and_fallback_never_reparses(frozen_kit, tmp_path, monkeypatch):
    forbid_raw_input(monkeypatch)
    before = {name: digest(frozen_kit / name) for name in ("manifest.json", "rater-1.csv", INPUT_SNAPSHOT_PATH)}
    def unavailable(*args, **kwargs):
        raise OSError("missing model")

    monkeypatch.setattr(comparison, "run_semantic", unavailable)
    output = tmp_path / "comparison"
    result = comparison.compare(frozen_kit, output, provenance="HUMAN_SINGLE_RATER", cache=tmp_path / "cache")
    assert result["status"] == "PARTIAL"
    assert result["inputMode"] == "FROZEN_PARSED"
    assert result["inputSnapshotSha256"] == digest(output / INPUT_SNAPSHOT_PATH)
    assert result["sourceArtifactsSha256"][INPUT_SNAPSHOT_PATH] == before[INPUT_SNAPSHOT_PATH]
    assert result["sourceUnchanged"] is True
    assert len(result["metrics"]) == 2
    assert before == {name: digest(frozen_kit / name) for name in before}
    assert not (output / "model-only/predictions-semantic.csv").exists()


def test_full_comparison_binds_all_three_methods_to_one_snapshot(frozen_kit, tmp_path, monkeypatch):
    forbid_raw_input(monkeypatch)

    class Vector:
        def __matmul__(self, other):
            return 0.5

    monkeypatch.setattr(semantic, "load_embedding_model", lambda *args, **kwargs: object())
    monkeypatch.setattr(semantic, "embed_documents",
                        lambda model, texts: ([Vector() for _ in texts], [1 for _ in texts]))
    monkeypatch.setattr(semantic, "version", lambda name: "synthetic-test")
    output = tmp_path / "three-method-comparison"
    result = comparison.compare(frozen_kit, output, provenance="HUMAN_SINGLE_RATER", cache=tmp_path / "cache")
    assert result["status"] == "COMPLETED" and result["semanticStatus"] == "COMPLETED"
    assert result["sourceUnchanged"] is True
    assert len(result["metrics"]) == 6
    for name in result["metrics"]:
        metric = json.loads((output / name).read_text())
        assert metric["inputSnapshotSha256"] == result["inputSnapshotSha256"]
        assert metric["inputMode"] == "FROZEN_PARSED"
        assert metric["interRaterAgreement"] is None


def test_freeze_refuses_overwrite_changed_raw_source_and_refreezing(source_kit, frozen_kit, tmp_path):
    before = digest(frozen_kit / INPUT_SNAPSHOT_PATH)
    with pytest.raises(FileExistsError):
        inputs.freeze(source_kit, frozen_kit)
    assert digest(frozen_kit / INPUT_SNAPSHOT_PATH) == before
    with pytest.raises(ValueError, match="already frozen"):
        inputs.freeze(frozen_kit, tmp_path / "second-freeze")
    manifest = read_manifest(source_kit)
    Path(manifest["cvs"][0]["path"]).write_bytes(b"changed synthetic PDF")
    with pytest.raises(ValueError, match="Source PDF changed"):
        inputs.freeze(source_kit, tmp_path / "changed")
    assert not (tmp_path / "changed").exists()


@pytest.mark.parametrize("settings", [{"ocr_max_pages": 0}, {"ocr_max_pages": 21},
                                    {"ocr_timeout_seconds": float("nan")}, {"ocr_timeout_seconds": 4}])
def test_invalid_ocr_settings_cannot_create_a_frozen_kit(source_kit, tmp_path, settings):
    output = tmp_path / "invalid-ocr"
    with pytest.raises(ValueError, match="OCR settings"):
        inputs.freeze(source_kit, output, **settings)
    assert not output.exists()


def test_freeze_cli_creates_separate_snapshot_with_explicit_ocr_settings(source_kit, tmp_path, fake_ocr,
                                                                       monkeypatch, capsys):
    from app.evaluation import kit
    output = tmp_path / "cli-frozen"
    monkeypatch.setattr("sys.argv", ["evaluation", "freeze", "--source-kit", str(source_kit),
                                    "--output", str(output), "--ocr-enabled",
                                    "--ocr-max-pages", "3", "--ocr-timeout-seconds", "10"])
    kit.main()
    assert json.loads(capsys.readouterr().out)["extractionMethods"] == {"OCR": 2}
    assert inputs.load_inputs(output)[0]["inputSnapshot"]["path"] == INPUT_SNAPSHOT_PATH

