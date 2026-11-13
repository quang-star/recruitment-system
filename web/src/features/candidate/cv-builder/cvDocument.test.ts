import { describe, expect, it } from "vitest";
import {
  createCvDocument, createCvEntry, validateCvDocument, cvDocumentErrors,
  exportCvDraft, importCvDraft, MAX_DRAFT_BYTES,
} from "./cvDocument";

describe("CV authoring drafts", () => {
  it("round-trips incomplete drafts without making them render-ready", () => {
    const doc = createCvDocument();
    expect(importCvDraft(exportCvDraft(doc))).toEqual(doc);
    expect(cvDocumentErrors(doc)).toHaveLength(2);
    doc.fullName = "Example Candidate";
    doc.skills = "TypeScript";
    expect(cvDocumentErrors(doc)).toEqual([]);
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

  it("rejects unsupported versions/templates, extra fields and wrong types", () => {
    const base = createCvDocument();
    for (const bad of [
      null, [], { ...base, schemaVersion: "cv-authoring/2.0" },
      { ...base, templateId: "modern" }, { ...base, extra: true },
      { ...base, fullName: 42 }, { ...base, education: {} },
    ]) expect(() => validateCvDocument(bad)).toThrow();
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
    // JSON escaping expands each NUL to six bytes.
    doc.projects = Array.from({ length: 6 }, () => ({
      ...createCvEntry(), description: "\0".repeat(8000),
    }));
    expect(() => validateCvDocument(doc)).toThrow(/UTF-8 bytes/);
  });

  it("validates calendar months, chronological order and current conflicts", () => {
    for (const [startMonth, endMonth, current] of [
      ["2024-13", "", false], ["0000-01", "", false],
      ["2024-1", "", false], ["2025-01", "2024-12", false],
      ["2024-01", "2024-02", true],
    ] as const) {
      const doc = createCvDocument();
      doc.experiences = [{ ...createCvEntry(), startMonth, endMonth, current }];
      expect(() => validateCvDocument(doc)).toThrow();
    }
    const doc = createCvDocument();
    doc.experiences = [{
      ...createCvEntry(), startMonth: "2024-01", endMonth: "", current: true,
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
});
