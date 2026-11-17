"""Synthetic unit assertions only; these labels are not research observations."""
from copy import deepcopy
import json

import pytest

from app.evaluation.suggestions import LABEL_FILES, main, prepare, status, template, validate_manifest


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, value):
    path.write_text(json.dumps(value), encoding="utf-8")


def career_catalog():
    entries = []
    for group, names in enumerate((("Technology", "Development", "Backend"), ("Finance", "Accounting", "Accountant"))):
        parent = None
        for level, (kind, name) in enumerate(zip(("INDUSTRY", "SPECIALIZATION", "POSITION"), names)):
            identifier = str(int(group * 3 + level + 1))
            entries.append({"id": identifier, "kind": kind, "parentId": parent, "name": name, "status": "ACTIVE", "version": 0})
            parent = identifier
    return entries


@pytest.fixture
def source(tmp_path):
    path = tmp_path / "input.json"
    template(path)
    value = read(path)
    value["catalogs"] = {
        "SKILL": {"version": "fixture-skills-v1", "snapshot": {"skills": [
            {"stableId": "nodejs", "canonicalName": "Node.js", "status": "PUBLISHED"},
            {"stableId": "kubernetes", "canonicalName": "Kubernetes", "status": "PUBLISHED"}]}},
        "CAREER": {"version": "fixture-careers-v1", "snapshot": career_catalog()},
    }
    write(path, value)
    return path


def fill_synthetic_assertions(kit):
    manifest = read(kit / "manifest.json")
    for name in LABEL_FILES:
        rows = read(kit / name)
        for index, (row, case) in enumerate(zip(rows, manifest["cases"])):
            row["reason"] = "Synthetic unit assertion, not human ground truth"
            if case["task"] == "SKILL":
                row.update(decision="MERGE", acceptable_answers=[["nodejs", "kubernetes"][index]])
            else:
                entries = manifest["catalogs"]["CAREER"]["snapshot"][(index - 2) * 3:(index - 1) * 3]
                choice = {}
                for key, entry in zip(("industry", "specialization", "position"), entries):
                    choice.update({key + "Id": entry["id"], key + "Name": entry["name"]})
                row.update(decision="CLASSIFY", acceptable_answers=[choice])
        write(kit / name, rows)


def test_prepare_is_blind_hash_bound_and_never_reports_quality(source, tmp_path):
    kit = tmp_path / "kit"
    result = prepare(source, kit)
    assert result["caseCount"] == 4 and result["qualityMetrics"] == "NOT_COMPUTED"
    assert not result["readyForPredictionComparison"]
    assert len(result["manifestSha256"]) == 64
    for name in LABEL_FILES:
        rows = read(kit / name)
        assert all(row["decision"] is None and row["acceptable_answers"] == [] and row["reason"] == "" for row in rows)
        assert all(set(row) == {"case_id", "decision", "acceptable_answers", "reason"} for row in rows)
    before = (kit / "rater-1.json").read_bytes()
    with pytest.raises(FileExistsError):
        prepare(source, kit)
    assert (kit / "rater-1.json").read_bytes() == before


@pytest.mark.parametrize("change", ["duplicate-input", "group-leak", "duplicate-id", "private", "fullwidth-private", "unbounded", "scores", "same-raters", "orphan", "deferred", "private-alias"])
def test_preparation_blocks_leakage_private_inputs_unblinding_and_bad_catalogs(source, tmp_path, change):
    value = read(source)
    if change == "duplicate-input":
        value["cases"][1]["input"] = deepcopy(value["cases"][0]["input"])
    elif change == "group-leak":
        value["cases"][1]["group_id"] = value["cases"][0]["group_id"]
    elif change == "duplicate-id":
        value["cases"][1]["case_id"] = value["cases"][0]["case_id"]
    elif change in {"private", "fullwidth-private", "unbounded"}:
        value["cases"][0]["input"]["term"] = {"private": "private@example.test", "fullwidth-private": "private＠example.test", "unbounded": "x" * 241}[change]
    elif change == "scores":
        value["cases"][0]["predicted_score"] = 100
    elif change == "same-raters":
        value["raters"].update(first="rater", second="rater")
    elif change == "orphan":
        value["catalogs"]["CAREER"]["snapshot"][1]["parentId"] = str(int(100))
    elif change == "deferred":
        value["catalogs"]["CAREER"]["snapshot"][0]["status"] = "DEFERRED"
    else:
        value["catalogs"]["SKILL"]["snapshot"]["skills"][0]["aliases"] = [{"value": "private＠example.test"}]
    write(source, value)
    with pytest.raises(ValueError):
        prepare(source, tmp_path / "bad-kit")
    assert not (tmp_path / "bad-kit").exists()


@pytest.mark.parametrize("target", ["input", "catalog"])
def test_status_rejects_changed_frozen_inputs_and_catalogs(source, tmp_path, target):
    kit = tmp_path / "kit"
    prepare(source, kit)
    manifest = read(kit / "manifest.json")
    if target == "input":
        manifest["cases"][0]["input"]["term"] = "Changed"
    else:
        manifest["catalogs"]["SKILL"]["snapshot"]["skills"][0]["canonicalName"] = "Changed"
    write(kit / "manifest.json", manifest)
    with pytest.raises(ValueError, match="changed"):
        status(kit)


def test_readiness_needs_complete_independent_valid_targets_and_human_signoff(source, tmp_path):
    value = read(source)
    value.update(blind_review_confirmed=True, protocol_review_confirmed=True)
    value["raters"] = {"first": "rater-a", "second": "rater-b", "adjudicator": "rater-c"}
    for case in value["cases"]:
        case.update(privacy_reviewed=True, rights_reference="synthetic-unit-only")
    write(source, value)
    kit = tmp_path / "kit"
    prepare(source, kit)
    fill_synthetic_assertions(kit)
    before = {name: (kit / name).read_bytes() for name in LABEL_FILES}
    result = status(kit)
    assert result["readyForPredictionComparison"] and result["qualityMetrics"] == "NOT_COMPUTED"
    assert result["warnings"] == ["SYNTHETIC_SMOKE_FIXTURES"]
    assert "Synthetic unit assertion" not in json.dumps(result)
    assert before == {name: (kit / name).read_bytes() for name in LABEL_FILES}
    rows = read(kit / "rater-2.json")
    rows[0]["acceptable_answers"] = ["forged-canonical-id"]
    rows[2]["acceptable_answers"][0]["positionId"] = rows[3]["acceptable_answers"][0]["positionId"]
    write(kit / "rater-2.json", rows)
    assert status(kit)["annotations"]["rater-2.json"]["remaining"] == 2
    assert not status(kit)["readyForPredictionComparison"]


@pytest.mark.parametrize("change", ["missing", "duplicate", "score"])
def test_annotation_inventory_and_blinding_are_validated(source, tmp_path, change):
    kit = tmp_path / "kit"
    prepare(source, kit)
    rows = read(kit / "rater-1.json")
    if change == "missing":
        rows.pop()
    elif change == "duplicate":
        rows[1] = deepcopy(rows[0])
    else:
        rows[0]["model_score"] = 100
    write(kit / "rater-1.json", rows)
    with pytest.raises(ValueError):
        status(kit)


def test_template_stays_pending_and_cli_failure_does_not_echo_private_content(tmp_path, monkeypatch, capsys):
    source = tmp_path / "template.json"
    template(source)
    validate_manifest(read(source))
    result = prepare(source, tmp_path / "pending-kit")
    assert "CATALOG_FREEZE_PENDING" in result["blockers"]
    value = read(source)
    value["cases"][0]["input"]["term"] = "private@example.test"
    write(source, value)
    monkeypatch.setattr("sys.argv", ["suggestions", "prepare", "--input", str(source), "--output", str(tmp_path / "invalid")])
    assert main() == 2
    output = capsys.readouterr()
    assert not output.out and "private@example.test" not in output.err
    assert "INVALID_SUGGESTION_RESEARCH_ARTIFACT" in output.err
