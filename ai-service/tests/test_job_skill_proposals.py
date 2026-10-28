from identity_fixtures import legacy_id, new_id
from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.cv.api import _validate_user_payload as validate_cv
from app.cv.parser import parse_pdf
from app.jd.api import _validate_user_payload as validate_jd
from app.jd.parser import parse_jd
from app.jd.repository import ParsedJdRevisionRecord, ParsedJdRevisionRepository
from app.matching.algorithm import compute_match
from app.shared.api import ApiContractError
from app.shared.gemini import GeminiExtractor, _FIELDS, _contract
from app.shared.groq import GroqExtractor
from app.shared.skill_proposals import propose_skill
from app.taxonomy.normalizer import normalize_skill


VERSION = str(legacy_id('779494ac-c858-4570-a884-6e88423b8e2b'))
SOURCE_HASH = "a" * 64
DESCRIPTION = "Build reliable systems with the team."
REQUIREMENTS = "Required: NewFrameworkX. Optional: ToolY."
SOURCE = f"Platform Engineer\n{DESCRIPTION}\n{REQUIREMENTS}"


def sections(kind="jd", **updates):
    result = {field: [] for field in _FIELDS[kind]}
    if kind == "jd":
        result.update(requiredSkills=["Required: NewFrameworkX."],
                      preferredSkills=["Optional: ToolY."],
                      requiredSkillNames=["NewFrameworkX"], preferredSkillNames=["ToolY"],
                      responsibilities=[DESCRIPTION])
    return result | updates


def extractor(monkeypatch, response, provider=GroqExtractor):
    values = {}
    for prefix in ("groq", "gemini"):
        values.update({f"{prefix}_enabled": True, f"{prefix}_api_key": SecretStr("synthetic-test-key"),
                       f"{prefix}_model": "test-model", f"{prefix}_max_input_chars": 30000})
    values["gemini_backup_api_key"] = SecretStr("")
    client = provider(SimpleNamespace(**values))
    monkeypatch.setattr(client, "_generate", lambda *args: response)
    return client


def proposed_jd(monkeypatch):
    return parse_jd(VERSION, SOURCE_HASH, "Platform Engineer", DESCRIPTION, REQUIREMENTS,
                    enricher=extractor(monkeypatch, sections()))


def parsed_cv(monkeypatch, text="Skills: NewFrameworkX, ToolY\nExperience\nPlatform Engineer\nBuild reliable systems with the team.", **kwargs):
    monkeypatch.setattr("app.cv.parser.PdfReader", lambda _: SimpleNamespace(
        pages=[SimpleNamespace(extract_text=lambda: text)]))
    return parse_pdf(VERSION, SOURCE_HASH, b"synthetic", ocr_enabled=False, **kwargs)


class ConfirmationSession:
    def __init__(self, record):
        self.answers = [record, None]
        self.added = []

    def scalar(self, _):
        return self.answers.pop(0)

    def add(self, item):
        self.added.append(item)

    def flush(self):
        pass


def confirm(payload, expected_id=None):
    owner = new_id()
    now = datetime.now(UTC)
    record = ParsedJdRevisionRecord(id=new_id(), job_id=new_id(), job_version_id=int(VERSION),
                                   owner_user_id=owner, revision_number=1, source_hash=SOURCE_HASH,
                                   payload=deepcopy(payload), status="PARSED", created_at=now,
                                   updated_at=now, version=0)
    result = ParsedJdRevisionRepository(ConfirmationSession(record)).confirm(
        int(VERSION), owner, expected_id or record.id, owner,
    )
    return result


@pytest.mark.parametrize("provider", [GroqExtractor, GeminiExtractor])
def test_llm_proposes_grounded_names_without_creating_global_taxonomy(monkeypatch, provider):
    result = parse_jd(VERSION, SOURCE_HASH, "Platform Engineer", DESCRIPTION, REQUIREMENTS,
                      enricher=extractor(monkeypatch, sections(), provider))
    _contract("jd").validate(result)
    for field, name in (("requiredSkills", "NewFrameworkX"), ("preferredSkills", "ToolY")):
        item = result["requirements"][field][0]
        assert item["raw"] == name
        assert item["canonicalSkillId"] is None
        assert item["normalizationStatus"] == "PENDING"
        assert item["confirmedByRecruiter"] is False
        location = next(row for row in result["evidence"] if row["id"] in item["evidenceIds"])
        assert SOURCE[location["start"]:location["end"]] == name
        assert normalize_skill(name) is None


@pytest.mark.parametrize("response", [
    sections(requiredSkillNames=["InventedTechnology"]),
    sections(requiredSkillNames=["ToolY"]),
    sections(preferredSkills=["Required: NewFrameworkX."], preferredSkillNames=["NewFrameworkX"]),
    sections(excludedSkills=["Required: NewFrameworkX."]),
])
def test_ungrounded_conflicting_or_excluded_names_fall_back(monkeypatch, response):
    result = parse_jd(VERSION, SOURCE_HASH, "Platform Engineer", DESCRIPTION, REQUIREMENTS,
                      enricher=extractor(monkeypatch, response))
    assert "GROQ_FALLBACK" in result["qualityFlags"]
    assert result["requirements"]["requiredSkills"] == []


def test_cv_llm_keeps_unfamiliar_skill_with_source_even_outside_skills_heading(monkeypatch):
    text = "Experience\nI use NewFrameworkX to build reliable systems with the team."
    cv = parsed_cv(monkeypatch, text, enricher=extractor(monkeypatch, sections("cv", skillNames=["NewFrameworkX"])))
    _contract("cv").validate(cv)
    assert cv["skills"][0]["raw"] == "NewFrameworkX"
    assert cv["skills"][0]["provenance"] == "EXTRACTED"
    assert cv["skills"][0]["canonicalSkillId"] is None
    assert "GROQ_ASSISTED_EXTRACTION" in cv["summary"]["qualityFlags"]


def test_recruiter_confirmation_enables_immediate_job_scoped_matching(monkeypatch):
    proposed = proposed_jd(monkeypatch)
    saved = validate_jd(int(VERSION), SOURCE_HASH, deepcopy(proposed), proposed)
    assert saved["requirements"]["requiredSkills"][0]["confirmedByRecruiter"] is False
    cv = parsed_cv(monkeypatch)
    before = compute_match(cv, saved)
    assert "UNCONFIRMED_JOB_SKILLS" in before.quality_flags
    assert not any(claim["label"] == "NewFrameworkX" for claim in before.claims)
    confirmed = confirm(saved)
    assert confirmed.status == "CONFIRMED"
    assert confirmed.payload["requirements"]["requiredSkills"][0]["confirmedByRecruiter"] is True
    assert saved["requirements"]["requiredSkills"][0]["confirmedByRecruiter"] is False
    after = compute_match(cv, confirmed.payload)
    component = next(row for row in after.components if row["name"] == "REQUIRED_SKILLS")
    assert component["details"]["required"] == 1
    assert component["details"]["jobScoped"] == 1
    assert component["score"] == 1
    assert after.claims[0]["type"] == "SUPPORTED"
    assert after.claims[0]["subject"] == "JOB_REQUIRED_SKILL"
    assert after.claims[0]["cvLocations"]
    assert "JOB_SCOPED_SKILLS" in after.quality_flags
    assert normalize_skill("NewFrameworkX") is None


@pytest.mark.parametrize("text,claim", [
    ("Skills: OtherTechnology\nExperience\nPlatform Engineer", "MISSING"),
    ("Skills: newframeworkx\nExperience\nPlatform Engineer", "SUPPORTED"),
])
def test_new_skill_is_in_denominator_and_compares_case_normalized_name(monkeypatch, text, claim):
    jd = confirm(proposed_jd(monkeypatch)).payload
    cv = parsed_cv(monkeypatch, text)
    result = compute_match(cv, jd)
    assert result.claims[0]["type"] == claim
    required = next(row for row in result.components if row["name"] == "REQUIRED_SKILLS")
    assert required["details"]["required"] == 1
    assert required["score"] == (1 if claim == "SUPPORTED" else 0)


def test_candidate_cannot_get_points_by_copying_evidence_to_a_new_skill(monkeypatch):
    jd = confirm(proposed_jd(monkeypatch)).payload
    prior = parsed_cv(monkeypatch, "Skills: ToolY\nExperience\nPlatform Engineer")
    edited = deepcopy(prior)
    edited["skills"].append({**prior["skills"][0], "raw": "NewFrameworkX"})
    validated = validate_cv(int(VERSION), edited, prior)
    result = compute_match(validated, jd)
    assert result.claims[0]["type"] == "UNCERTAIN"
    assert result.claims[0]["cvEvidenceIds"] == []
    assert "UNVERIFIED_SKILL_ASSERTIONS" in result.quality_flags


def test_job_skill_identity_is_isolated_and_stale_confirmation_does_not_approve(monkeypatch):
    proposed = proposed_jd(monkeypatch)
    with pytest.raises(ValueError, match="stale"):
        confirm(proposed, new_id())
    assert proposed["requirements"]["requiredSkills"][0]["confirmedByRecruiter"] is False
    jd = confirm(proposed).payload
    cv = parsed_cv(monkeypatch)
    first = compute_match(cv, jd).claims[0]["skillId"]
    jd["document"]["jobVersionId"] = str(new_id())
    assert compute_match(cv, jd).claims[0]["skillId"] != first


@pytest.mark.parametrize("required,preferred", [
    (["NewFrameworkX", "newframeworkx"], []),
    (["NewFrameworkX"], ["NewFrameworkX"]),
    (["React", "ReactJS"], []),
])
def test_recruiter_cannot_double_count_duplicate_or_alias_skills(monkeypatch, required, preferred):
    proposed = proposed_jd(monkeypatch)
    value = deepcopy(proposed)
    template = proposed["requirements"]["requiredSkills"][0]
    value["requirements"]["requiredSkills"] = [{**template, "raw": name} for name in required]
    value["requirements"]["preferredSkills"] = [{**template, "raw": name} for name in preferred]
    with pytest.raises(ApiContractError) as error:
        validate_jd(int(VERSION), SOURCE_HASH, value, proposed)
    assert error.value.code == "PARSED_JD_DUPLICATE_SKILL"


@pytest.mark.parametrize("source", ["Use NewFrameworkX++.", "Use NewFrameworkX.js.", "Use Other.NewFrameworkX."])
def test_a_fragment_of_another_technology_is_not_source_evidence(source):
    with pytest.raises(ValueError, match="supporting source"):
        propose_skill("NewFrameworkX", VERSION, source, kind="jd", clauses=[source])


def test_missing_new_skill_lowers_score_instead_of_disappearing_from_denominator(monkeypatch):
    proposed = proposed_jd(monkeypatch)
    known = parse_jd(VERSION, SOURCE_HASH, "Platform Engineer", DESCRIPTION, "Java is required.")
    proposed["requirements"]["requiredSkills"].extend(known["requirements"]["requiredSkills"])
    jd = confirm(proposed).payload
    cv = parsed_cv(monkeypatch, "Skills: Java\nExperience\nPlatform Engineer")
    result = compute_match(cv, jd)
    component = next(row for row in result.components if row["name"] == "REQUIRED_SKILLS")
    assert component["details"]["required"] == 2
    assert component["details"]["matched"] == 1
    assert component["score"] == 0.5


@pytest.mark.parametrize("name", ["   ", "New\nFrameworkX", "x" * 241, None])
def test_invalid_recruiter_skill_name_is_rejected_before_confirmation(monkeypatch, name):
    proposed = proposed_jd(monkeypatch)
    value = deepcopy(proposed)
    value["requirements"]["requiredSkills"][0]["raw"] = name
    with pytest.raises(ApiContractError) as error:
        validate_jd(int(VERSION), SOURCE_HASH, value, proposed)
    assert error.value.code == "PARSED_JD_SKILL_NAME_INVALID"
