from identity_fixtures import legacy_id
from types import SimpleNamespace

from app.cv.parser import parse_pdf
from app.jd.parser import parse_jd
from app.shared.evidence import attach_source_evidence


VERSION = str(legacy_id('779494ac-c858-4570-a884-6e88423b8e2b'))


def test_cv_sections_have_source_locations_on_the_correct_page(monkeypatch):
    pages = [
        "Summary\nEnglish B2\nAWS Certified Developer\nLooking for opportunities in software development.",
        "Experience\nBackend Developer\n01/2022 - 12/2023\nBuild Java backend services.\n"
        "Education\nBachelor Computer Science 2018 - 2021\n"
        "Languages: English B2, Japanese N3\n"
        "Projects\nRECRUITMENT PORTAL Jun 2026 - Present\nBuild Kafka integrations.\n"
        "Certifications\nAWS Certified Developer",
    ]
    reader = SimpleNamespace(pages=[SimpleNamespace(extract_text=lambda text=text: text) for text in pages])
    monkeypatch.setattr("app.cv.parser.PdfReader", lambda _: reader)
    payload = parse_pdf(VERSION, "a" * 64, b"synthetic", ocr_enabled=False)
    source = "\n".join(pages)
    locations = {item["id"]: item for item in payload["evidence"]}
    for section in ("experiences", "education", "languages", "projects", "certificates"):
        assert payload[section], section
        for item in payload[section]:
            assert item["evidenceIds"], section
            for evidence_id in item["evidenceIds"]:
                location = locations[evidence_id]
                assert location["page"] == 2, (section, source[location["start"]:location["end"]])
                assert 0 <= location["start"] < location["end"] <= len(source)
    language = payload["languages"][0]
    span = locations[language["evidenceIds"][0]]
    assert source[span["start"]:span["end"]] == "English B2"
    project = locations[payload["projects"][0]["evidenceIds"][0]]
    assert "Jun 2026 - Present" in source[project["start"]:project["end"]]


def test_jd_title_responsibilities_and_metadata_resolve_to_source():
    title = "Backend Engineer"
    description = "Build Java services. Maintain Kafka integrations."
    requirements = "Bachelor degree required. English B2 required."
    payload = parse_jd(VERSION, "a" * 64, title, description, requirements)
    source = f"{title}\n{description}\n{requirements}"
    locations = {item["id"]: item for item in payload["evidence"]}
    for item in [payload["title"], *payload["responsibilities"],
                 *payload["requirements"]["education"], *payload["requirements"]["languages"]]:
        assert item["evidenceIds"]
        span = locations[item["evidenceIds"][0]]
        assert source[span["start"]:span["end"]] == item["raw"]
        assert span["page"] is None


def test_missing_source_does_not_get_fabricated_evidence():
    item = {"evidenceIds": ["parser-reference"]}
    locations = []
    attach_source_evidence(item, "Build Java services", "Build React services", locations)
    assert item["evidenceIds"] == []
    assert locations == []


def test_ocr_locations_do_not_invent_pdf_page_numbers(monkeypatch):
    monkeypatch.setattr("app.cv.parser.PdfReader", lambda _: SimpleNamespace(
        pages=[SimpleNamespace(extract_text=lambda: "")],
    ))
    text = "Experience\nBackend Developer\n2022 - 2023\nBuild Java services and Kafka integrations.\nLanguages\nEnglish B2"
    payload = parse_pdf(VERSION, "a" * 64, b"synthetic", ocr_extractor=lambda *_: text)
    assert payload["document"]["textExtractionMethod"] == "OCR"
    assert payload["evidence"]
    assert all(item["page"] is None for item in payload["evidence"])
