import { describe, expect, it } from "vitest";
import {
  BODY_SECTIONS,
  computeCvCompleteness,
  createCvDocument,
  createCvEntry,
  cvDocumentErrors,
  DEFAULT_ACCENT_COLOR,
  exportCvDraft,
  fromServerDraft,
  importCvDraft,
  LEGACY_SCHEMA,
  MAX_DRAFT_BYTES,
  moveSectionOrder,
  reorderArray,
  reorderSectionOrder,
  TEMPLATES,
  toServerDraftRequest,
  validateCvDocument,
} from "./cvDocument";
import { createSampleCvDocument } from "./cvTemplates";

describe("CV authoring drafts", () => {
  it("round-trips incomplete v2 drafts and supports template/accent/sectionOrder", () => {
    const doc = createCvDocument();
    doc.templateId = "modern";
    doc.accentColor = "#1E3A8A";
    doc.sectionOrder = moveSectionOrder(doc.sectionOrder, 2, -1);
    const parsed = importCvDraft(exportCvDraft(doc));
    expect(parsed.templateId).toBe("modern");
    expect(parsed.accentColor).toBe("#1e3a8a");
    expect(parsed.sectionOrder[1]).toBe("experiences");
    expect(cvDocumentErrors(doc)).toHaveLength(2);
    doc.fullName = "Example Candidate";
    doc.skills = "TypeScript";
    expect(cvDocumentErrors(doc)).toEqual([]);
  });

  it("upgrades legacy cv-authoring/1.0 drafts seamlessly", () => {
    const legacy = {
      schemaVersion: LEGACY_SCHEMA,
      templateId: "classic",
      title: "Legacy CV",
      fullName: "Nguyễn Minh An",
      headline: "",
      email: "",
      phone: "",
      location: "",
      links: "",
      introduction: "",
      skills: "Java",
      experiences: [],
      education: [],
      projects: [],
      certificates: [],
      languages: [],
    };
    const upgraded = importCvDraft(JSON.stringify(legacy));
    expect(upgraded.schemaVersion).toBe("cv-authoring/2.0");
    expect(upgraded.templateId).toBe("classic");
    expect(upgraded.accentColor).toBe(DEFAULT_ACCENT_COLOR);
    expect(upgraded.sectionOrder).toEqual([...BODY_SECTIONS]);
  });

  it("maps cleanly to and from server draft contracts", () => {
    const doc = createCvDocument();
    doc.title = "CV Backend";
    doc.templateId = "minimal";
    doc.fullName = "Nguyễn Minh An";
    const req = toServerDraftRequest(doc, 3);
    expect(req).toMatchObject({
      title: "CV Backend",
      templateId: "minimal",
      accentColor: DEFAULT_ACCENT_COLOR,
      expectedVersion: 3,
    });
    const roundTripped = fromServerDraft({
      draftId: "9007199254740993",
      candidateUserId: "1001",
      title: req.title,
      templateId: req.templateId,
      accentColor: req.accentColor,
      sectionOrder: req.sectionOrder,
      payload: req.payload,
      createdAt: "2026-11-14T00:00:00Z",
      updatedAt: "2026-11-14T00:00:00Z",
      version: 4,
    });
    expect(roundTripped.templateId).toBe("minimal");
    expect(roundTripped.fullName).toBe("Nguyễn Minh An");
  });

  it("preserves IDs and detaches validated data", () => {
    const doc = createCvDocument();
    const entry = createCvEntry();
    doc.experiences.push(entry);
    const copy = importCvDraft(exportCvDraft(doc));
    expect(copy.experiences[0].id).toBe(entry.id);
    copy.experiences[0].title = "Changed";
    expect(entry.title).toBe("");
    expect(createCvEntry().id).not.toBe(entry.id);
  });

  it("rejects unsupported versions, templates, colors, sectionOrder, extra fields and wrong types", () => {
    const base = createCvDocument();
    for (const bad of [
      null,
      [],
      { ...base, schemaVersion: "cv-authoring/3.0" },
      { ...base, templateId: "fancy" },
      { ...base, accentColor: "teal" },
      { ...base, sectionOrder: ["introduction", "introduction"] },
      { ...base, extra: true },
      { ...base, fullName: 42 },
      { ...base, education: {} },
    ]) {
      expect(() => validateCvDocument(bad)).toThrow();
    }
    const entry = { ...createCvEntry(), current: "false" };
    expect(() => validateCvDocument({ ...base, projects: [entry] })).toThrow();
  });

  it("rejects duplicate IDs across sections and empty IDs", () => {
    const doc = createCvDocument();
    const entry = createCvEntry();
    doc.education = [entry];
    doc.projects = [{ ...entry }];
    expect(() => validateCvDocument(doc)).toThrow(/duplicate/);
    doc.projects = [];
    doc.education[0].id = "";
    expect(() => validateCvDocument(doc)).toThrow(/ID/);
  });

  it("caps sections, individual strings and the total serialized payload", () => {
    const doc = createCvDocument();
    doc.projects = Array.from({ length: 21 }, () => createCvEntry());
    expect(() => validateCvDocument(doc)).toThrow(/maximum/);
    doc.projects = [];
    doc.fullName = "x".repeat(201);
    expect(() => validateCvDocument(doc)).toThrow(/exceeds/);
    doc.fullName = "";
    doc.projects = Array.from({ length: 6 }, () => ({
      ...createCvEntry(),
      description: "\0".repeat(8000),
    }));
    expect(() => validateCvDocument(doc)).toThrow(/UTF-8 bytes/);
  });

  it("validates calendar months, chronological order and current conflicts", () => {
    for (const [startMonth, endMonth, current] of [
      ["2024-13", "", false],
      ["0000-01", "", false],
      ["2024-1", "", false],
      ["2025-01", "2024-12", false],
      ["2024-01", "2024-02", true],
    ] as const) {
      const doc = createCvDocument();
      doc.experiences = [{ ...createCvEntry(), startMonth, endMonth, current }];
      expect(() => validateCvDocument(doc)).toThrow();
    }
    const doc = createCvDocument();
    doc.experiences = [{
      ...createCvEntry(),
      startMonth: "2024-01",
      endMonth: "",
      current: true,
    }];
    expect(validateCvDocument(doc)).toEqual(doc);
  });

  it("rejects malformed/oversized JSON and prototype-related extra keys", () => {
    expect(() => importCvDraft("{")).toThrow(/valid JSON/);
    expect(() => importCvDraft(" ".repeat(MAX_DRAFT_BYTES + 1))).toThrow();
    const json = exportCvDraft(createCvDocument());
    expect(() => importCvDraft(
      json.replace(/}$/, ',"__proto__":{"polluted":true}}'),
    )).toThrow(/unknown fields/);
  });

  it("does not count contacts, dates or empty placeholder entries as content", () => {
    const doc = createCvDocument();
    doc.fullName = "Example Candidate";
    doc.email = "example@example.invalid";
    doc.languages = [{ ...createCvEntry(), startMonth: "2024-01" }];
    expect(cvDocumentErrors(doc)).toEqual([
      "Bổ sung kỹ năng, giới thiệu hoặc ít nhất một mục nội dung.",
    ]);
    doc.languages[0].title = "English";
    expect(cvDocumentErrors(doc)).toEqual([]);
  });

  it("reorders sections and entries across arbitrary indices and builds valid sample documents", () => {
    const moved = reorderSectionOrder([...BODY_SECTIONS], 4, 0);
    expect(moved[0]).toBe("projects");
    expect(moved).toHaveLength(BODY_SECTIONS.length);
    expect(reorderSectionOrder([...BODY_SECTIONS], -1, 2)).toEqual([...BODY_SECTIONS]);

    expect(reorderArray(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);

    for (const templateId of TEMPLATES) {
      const sample = createSampleCvDocument(templateId);
      expect(validateCvDocument(sample)).toEqual(sample);
      expect(cvDocumentErrors(sample)).toEqual([]);
    }
  });

  it("validates TopCV executive template, styling options, safe photo data URLs and completeness", () => {
    const doc = createCvDocument();
    doc.templateId = "executive";
    doc.language = "en";
    doc.fontSize = "small";
    doc.lineSpacing = "relaxed";
    doc.hiddenSections = ["certificates"];
    doc.photoDataUrl = "data:image/png;base64,iVBORw0KGgo=";
    doc.fullName = "Nguyễn Minh An";
    doc.headline = "Senior Backend Engineer";
    doc.email = "an@example.invalid";
    doc.introduction = "Kỹ sư phát triển hệ thống web quy mô lớn và tối ưu hiệu năng truy vấn.";
    doc.skills = "Java, Spring Boot, PostgreSQL";

    const roundTripped = importCvDraft(exportCvDraft(doc));
    expect(roundTripped.templateId).toBe("executive");
    expect(roundTripped.language).toBe("en");
    expect(roundTripped.hiddenSections).toEqual(["certificates"]);
    expect(computeCvCompleteness(roundTripped).score).toBe(65);

    // Phase-2 fields & 7-section backward compatibility
    roundTripped.fontFamily = "serif";
    roundTripped.dateOfBirth = "1999-08-15";
    roundTripped.gender = "Nam";
    roundTripped.sectionTitles = { awards: "Danh hiệu nổi bật" };
    roundTripped.awards = [{ ...createCvEntry(), title: "Giải Nhất Hackathon" }];
    roundTripped.activities = [{ ...createCvEntry(), title: "CLB IT" }];
    roundTripped.hobbies = [{ ...createCvEntry(), title: "Đọc sách" }];

    const phase2Parsed = importCvDraft(exportCvDraft(roundTripped));
    expect(phase2Parsed.fontFamily).toBe("serif");
    expect(phase2Parsed.dateOfBirth).toBe("1999-08-15");
    expect(phase2Parsed.gender).toBe("Nam");
    expect(phase2Parsed.sectionTitles).toEqual({ awards: "Danh hiệu nổi bật" });
    expect(phase2Parsed.awards).toHaveLength(1);
    expect(phase2Parsed.activities).toHaveLength(1);
    expect(phase2Parsed.hobbies).toHaveLength(1);

    const legacySevenSection = validateCvDocument({
      ...phase2Parsed,
      sectionOrder: ["introduction", "skills", "experiences", "education", "projects", "certificates", "languages"],
    });
    expect(legacySevenSection.sectionOrder).toEqual([...BODY_SECTIONS]);

    expect(() =>
      validateCvDocument({ ...doc, photoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }),
    ).toThrow(/photoDataUrl/);
    expect(() =>
      validateCvDocument({ ...doc, photoDataUrl: "https://external.invalid/avatar.png" }),
    ).toThrow(/photoDataUrl/);
  });
});
