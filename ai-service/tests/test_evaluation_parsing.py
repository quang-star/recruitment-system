"""Synthetic parsing references only: no corpus labels, external OCR or provider."""
from copy import deepcopy
from io import BytesIO
import json
from pathlib import Path
from types import SimpleNamespace

from pypdf import PdfWriter
import pytest

from app.evaluation import inputs, parsing, parsing_gold as gold
from app.evaluation.kit import prepare
from app.evaluation.validation import INPUT_SNAPSHOT_PATH, digest, read_manifest

TAXONOMY = Path(__file__).resolve().parents[2] / "contracts/taxonomy/it-skills-v2.seed.json"


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def fixture(tmp_path, monkeypatch):
    pdfs = tmp_path / "pdfs"
    pdfs.mkdir()
    for index, pages in enumerate((1, 7)):
        writer = PdfWriter()
        for _ in range(pages):
            writer.add_blank_page(width=595 + index, height=842)
        buffer = BytesIO()
        writer.write(buffer)
        (pdfs / f"synthetic-{index}.pdf").write_bytes(buffer.getvalue())
    jobs = tmp_path / "jobs.json"
    save(jobs, [{"id": "java", "title": "Backend Developer", "description": "Build Java services",
                 "requirements": "Java and Spring Boot"}])
    source = tmp_path / "source"
    prepare(pdfs, jobs, source, 2, 42, annotation_provenance="HUMAN_SINGLE_RATER")
    parse = inputs.parse_pdf

    def fake_ocr(*args, **kwargs):
        return parse(*args, **kwargs, ocr_extractor=lambda *unused:
                     "Skills\nJava, Spring Boot\nExperience\nBackend Developer\n2020-01 - Present\n"
                     "Build reliable Java services and Spring Boot applications. Design and test distributed systems.")
    monkeypatch.setattr(inputs, "parse_pdf", fake_ocr)
    frozen = tmp_path / "frozen"
    inputs.freeze(source, frozen, ocr_enabled=True, ocr_max_pages=3, ocr_timeout_seconds=10)
    template = tmp_path / "template.json"
    gold.prepare(frozen, template, TAXONOMY, relationship="AUTHOR_AND_SYSTEM_DEVELOPER")
    reference = json.loads(template.read_text(encoding="utf-8"))
    reference["annotationProvenance"] = "SYNTHETIC"
    for row in reference["documents"]:
        row.update(pagesReviewed=row["evaluationPages"], readingMethod="SOURCE_PDF_WITH_OCR", reviewComplete=True)
        for field in row["fields"].values():
            field.update(status="ABSENT", items=[])
        row["fields"]["skills"] = {"status": "PRESENT", "items": [
            {"raw": "Java", "canonicalSkillId": "1", "evidencePage": 1},
            {"raw": "SpringBoot", "canonicalSkillId": "2", "evidencePage": 1},
        ]}
        row["fields"]["experiences"] = {"status": "PRESENT", "items": [
            {"titleRaw": "Backend Developer", "startMonth": "2020-01", "endMonth": None,
             "startPrecision": "MONTH", "endPrecision": "CURRENT", "isCurrent": True, "evidencePage": 1},
        ]}
    labels = tmp_path / "gold.json"
    save(labels, reference)
    return SimpleNamespace(source=source, frozen=frozen, template=template, labels=labels, gold=reference, root=tmp_path)


def reseal(kit, update):
    path = kit / INPUT_SNAPSHOT_PATH
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    update(snapshot)
    save(path, snapshot)
    manifest = read_manifest(kit)
    manifest["inputSnapshot"]["sha256"] = digest(path)
    save(kit / "manifest.json", manifest)


def test_prepare_is_blank_and_status_has_no_facts(fixture):
    template = json.loads(fixture.template.read_text(encoding="utf-8"))
    assert template["annotationProvenance"] == "UNKNOWN"
    assert all(not row["reviewComplete"] and not row["pagesReviewed"] for row in template["documents"])
    long = next(row for row in template["documents"] if row["pageCount"] == 7)
    assert long["evaluationPages"] == [1, 2, 3]
    status = gold.status(fixture.frozen, fixture.template)
    assert status["reviewedBySplit"] == {"dev": 0, "test": 0}
    assert status["fieldStatuses"]["skills"] == {"NOT_REVIEWED": 2}
    assert "SpringBoot" not in json.dumps(status)
    with pytest.raises(ValueError, match="Complete every"):
        parsing.evaluate(fixture.frozen, fixture.template, "dev")
    before = fixture.template.read_bytes()
    with pytest.raises(FileExistsError):
        gold.prepare(fixture.frozen, fixture.template, TAXONOMY)
    assert fixture.template.read_bytes() == before


def test_perfect_synthetic_reference_and_lineage_without_pdf_access(fixture, monkeypatch):
    original = Path.read_bytes
    def guard(path):
        if path.suffix.lower() == ".pdf":
            pytest.fail("Parsing evaluation must not reopen raw PDF")
        return original(path)
    monkeypatch.setattr(Path, "read_bytes", guard)
    monkeypatch.setattr(inputs, "_parse_inputs", lambda *args, **kwargs: pytest.fail("No reparsing"))
    result = parsing.evaluate(fixture.frozen, fixture.labels, "dev")
    assert result["aggregate"]["skills"]["micro"] == {"tp": 2, "fp": 0, "fn": 0, "precision": 1., "recall": 1., "f1": 1.}
    assert result["aggregate"]["titles"]["micro"]["f1"] == 1
    assert result["aggregate"]["intervals"]["micro"]["f1"] == 1
    assert result["aggregate"]["normalization"]["accuracy"] == 1
    assert result["interRaterAgreement"] is None
    assert "NON_HUMAN_OR_UNVERIFIED_REFERENCE_LABELS" in result["warnings"]
    assert "REFERENCE_LABELS_AUTHORED_BY_DEVELOPER" in result["warnings"]
    assert len(result["goldSha256"]) == len(result["inputSnapshotSha256"]) == 64
    assert set(result["scorerSha256"]) == {"parsing.py", "parsing_gold.py"}
    assert "SpringBoot" not in json.dumps(result) and "Backend Developer" not in json.dumps(result)


@pytest.mark.parametrize(("tp", "fp", "fn", "precision", "recall", "f1"), [
    (0, 0, 0, None, None, None), (0, 0, 2, None, 0., 0.), (0, 2, 0, 0., None, 0.),
    (1, 1, 2, .5, .333333, .4),
])
def test_rates_have_explicit_zero_denominators(tp, fp, fn, precision, recall, f1):
    result = parsing.rates(tp, fp, fn)
    assert (result["precision"], result["recall"], result["f1"]) == (precision, recall, f1)


def test_alias_unicode_punctuation_and_duplicates(fixture):
    catalog = gold.validate(fixture.gold, read_manifest(fixture.frozen))
    assert gold.skill_key(" SpringBoot ", catalog) == gold.skill_key("Ｓｐｒｉｎｇ　Ｂｏｏｔ", catalog)
    assert gold.skill_key("Java", catalog) != gold.skill_key("JavaScript", catalog)
    assert len({gold.skill_key(term, catalog) for term in ("C++", "C#", "C", ".NET")}) == 4
    result = parsing.counts({"a", "b"}, ["a", "a", "c"])
    assert (result["tp"], result["fp"], result["fn"], result["duplicatePredictions"]) == (1, 1, 1, 1)


def test_wrong_or_conflicting_canonical_ids_do_not_hide_behind_raw_match(fixture):
    catalog = gold.validate(fixture.gold, read_manifest(fixture.frozen))
    expected = [{"raw": "Java", "canonicalSkillId": "1"}]
    for predicted in ([{"raw": "Java", "canonicalSkillId": "2"}],
                      [{"raw": "Java", "canonicalSkillId": "1"}, {"raw": "Java", "canonicalSkillId": None}]):
        result = parsing._normalization(expected, predicted, catalog)
        assert result["correct"] == 0 and result["evaluated"] == 1 and result["accuracy"] == 0


def test_partial_fields_excluded_and_empty_metrics_not_perfect(fixture):
    for row in fixture.gold["documents"]:
        row["fields"]["skills"] = {"status": "UNREADABLE", "items": []}
        row["fields"]["experiences"] = {"status": "PARTIAL", "items": []}
    save(fixture.labels, fixture.gold)
    result = parsing.evaluate(fixture.frozen, fixture.labels, "dev")
    assert result["aggregate"]["skills"]["evaluatedDocuments"] == 0
    assert result["aggregate"]["skills"]["micro"]["f1"] is None
    assert result["aggregate"]["skills"]["macro"]["f1"] == {"value": None, "documentCount": 0}
    assert "UNREADABLE_OR_PARTIAL_REFERENCE_FIELDS_EXCLUDED" in result["warnings"]


def test_year_only_gold_excludes_interval_document_but_not_title(fixture):
    for row in fixture.gold["documents"]:
        row["fields"]["experiences"]["items"][0].update(startPrecision="YEAR", startMonth=None, startRaw="2020")
    save(fixture.labels, fixture.gold)
    result = parsing.evaluate(fixture.frozen, fixture.labels, "dev")
    assert result["aggregate"]["titles"]["micro"]["f1"] == 1
    assert result["aggregate"]["intervals"]["excludedDocuments"] == 1
    assert result["documents"][0]["goldIntervalsWithoutMonthPrecision"] == 1
    assert "INTERVAL_DOCUMENTS_WITH_INCOMPLETE_GOLD_EXCLUDED" in result["warnings"]


@pytest.mark.parametrize("change", ["source", "split", "page_count", "duplicate", "unreviewed_page", "incomplete", "empty_present", "null_month", "bad_current", "reversed", "wrong_id", "unknown_property"])
def test_invalid_gold_rejected_without_printing_raw_values(fixture, change):
    row = fixture.gold["documents"][0]
    skill = row["fields"]["skills"]["items"][0]
    experience = row["fields"]["experiences"]["items"][0]
    if change == "source":
        row["sourceHash"] = "f" * 64
    elif change == "split":
        row["split"] = "test" if row["split"] == "dev" else "dev"
    elif change == "page_count":
        row["pageCount"] += 1
    elif change == "duplicate":
        row["fields"]["skills"]["items"].append(deepcopy(skill))
    elif change == "unreviewed_page":
        skill["evidencePage"] = 99
    elif change == "incomplete":
        row["pagesReviewed"] = []
    elif change == "empty_present":
        row["fields"]["skills"]["items"] = []
    elif change == "null_month":
        experience["startMonth"] = None
    elif change == "bad_current":
        experience["isCurrent"] = False
    elif change == "reversed":
        experience.update(endPrecision="MONTH", isCurrent=False, endMonth="2019-01")
    elif change == "wrong_id":
        skill["canonicalSkillId"] = "2"
    elif change == "unknown_property":
        skill["email"] = "synthetic.private@example.com"
    with pytest.raises(ValueError) as error:
        gold.validate(fixture.gold, read_manifest(fixture.frozen))
    assert "synthetic.private" not in str(error.value)


def test_scope_mismatch_is_rejected_instead_of_silently_cropping_gold(fixture):
    row = next(row for row in fixture.gold["documents"] if row["pageCount"] == 7)
    row.update(evaluationPages=list(range(1, 8)), pagesReviewed=list(range(1, 8)))
    save(fixture.labels, fixture.gold)
    with pytest.raises(ValueError, match="evaluation pages differ"):
        parsing.evaluate(fixture.frozen, fixture.labels, row["split"])


def test_legacy_kit_rejected_and_template_can_precede_freeze(fixture):
    before = fixture.source / "manifest.json"
    original = before.read_bytes()
    path = fixture.root / "legacy-gold.json"
    gold.prepare(fixture.source, path, TAXONOMY)
    assert before.read_bytes() == original
    with pytest.raises(ValueError, match="requires frozen"):
        parsing.evaluate(fixture.source, path, "dev")


def test_stale_gold_or_snapshot_and_taxonomy_are_rejected(fixture):
    path = fixture.frozen / INPUT_SNAPSHOT_PATH
    original = path.read_bytes()
    path.write_bytes(original + b" ")
    with pytest.raises(ValueError, match="snapshot changed"):
        parsing.evaluate(fixture.frozen, fixture.labels, "dev")
    path.write_bytes(original)
    fixture.gold["sourceManifestSha256"] = "f" * 64
    save(fixture.labels, fixture.gold)
    with pytest.raises(ValueError, match="source manifest or taxonomy"):
        parsing.evaluate(fixture.frozen, fixture.labels, "dev")
    fixture.gold["sourceManifestSha256"] = json.loads(original)["sourceManifestSha256"]
    fixture.gold["taxonomySnapshot"]["skills"][0]["aliases"].append(
        {"value": "SyntheticJavaAlias", "normalized": "syntheticjavaalias", "language": "neutral"})
    fixture.gold["taxonomySha256"] = gold.json_digest(fixture.gold["taxonomySnapshot"])
    save(fixture.labels, fixture.gold)
    with pytest.raises(ValueError, match="source manifest or taxonomy"):
        parsing.evaluate(fixture.frozen, fixture.labels, "dev")


def test_bad_frozen_payload_and_invalid_split_are_rejected(fixture):
    with pytest.raises(ValueError, match="Split"):
        parsing.evaluate(fixture.frozen, fixture.labels, "all")
    def modify(snapshot):
        next(iter(snapshot["cvs"].values()))["email"] = "synthetic.private@example.com"
    reseal(fixture.frozen, modify)
    with pytest.raises(ValueError, match="versioned schema") as error:
        parsing.evaluate(fixture.frozen, fixture.labels, "dev")
    assert "synthetic.private" not in str(error.value)


def test_cli_never_overwrites_metrics(fixture, monkeypatch):
    output = fixture.root / "metrics.json"
    output.write_text("existing evidence", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["parsing", "evaluate", "--kit", str(fixture.frozen), "--gold", str(fixture.labels),
                                   "--split", "dev", "--output", str(output)])
    with pytest.raises(FileExistsError):
        parsing.main()
    assert output.read_text(encoding="utf-8") == "existing evidence"


def test_cli_writes_only_synthetic_metric_summary(fixture, monkeypatch, capsys):
    output = fixture.root / "new-metrics.json"
    monkeypatch.setattr("sys.argv", ["parsing", "evaluate", "--kit", str(fixture.frozen), "--gold", str(fixture.labels),
                                   "--split", "dev", "--output", str(output)])
    parsing.main()
    result = json.loads(output.read_text(encoding="utf-8"))
    assert result["annotationProvenance"] == "SYNTHETIC"
    assert result["aggregate"]["skills"]["micro"]["f1"] == 1
    assert "Backend Developer" not in capsys.readouterr().out


def test_interval_month_is_exact_not_tolerant(fixture):
    for row in fixture.gold["documents"]:
        row["fields"]["experiences"]["items"][0]["startMonth"] = "2020-02"
    save(fixture.labels, fixture.gold)
    result = parsing.evaluate(fixture.frozen, fixture.labels, "dev")
    assert result["aggregate"]["titles"]["micro"]["f1"] == 1
    assert result["aggregate"]["intervals"]["micro"]["fp"] == result["aggregate"]["intervals"]["micro"]["fn"] == 1


def test_status_checks_snapshot_and_ambiguous_catalog_rejected(fixture):
    path = fixture.frozen / INPUT_SNAPSHOT_PATH
    path.write_bytes(path.read_bytes() + b" ")
    with pytest.raises(ValueError, match="snapshot changed"):
        gold.status(fixture.frozen, fixture.template)
    fixture.gold["taxonomySnapshot"]["skills"][1]["aliases"].append(
        {"value": "Java", "normalized": "java", "language": "neutral"})
    fixture.gold["taxonomySha256"] = gold.json_digest(fixture.gold["taxonomySnapshot"])
    with pytest.raises(ValueError, match="ambiguous alias"):
        gold.validate(fixture.gold, read_manifest(fixture.frozen))


@pytest.mark.parametrize("policy", [{"ocrEnabled": "true"}, {"ocrMaxPages": True}, {"ocrTimeoutSeconds": float("inf")}])
def test_invalid_frozen_policy_is_not_reported_as_verified(fixture, policy):
    reseal(fixture.frozen, lambda snapshot: snapshot["processing"].update(policy))
    with pytest.raises(ValueError, match="extraction policy"):
        parsing.evaluate(fixture.frozen, fixture.labels, "dev")
