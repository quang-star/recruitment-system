import { expect, it } from "vitest";
import type { CandidateProfile } from "../CandidateProfilePage";
import type { ParsedCvPayload } from "../ParsedCvReview";
import { createCvDocument } from "./cvDocument";
import { CvImportLimitError, importParsedCv, prefillCvProfile } from "./cvImport";

it("imports professional content without old source evidence or redacted display labels", () => {
  const doc = { ...createCvDocument(), fullName: "Tên được nhập tay", email: "demo@example.invalid" };
  const parsed = {
    skills: [{ raw: "Java", canonicalSkillId: "100", evidenceIds: ["old-evidence"] }],
    experiences: [{ titleRaw: "Backend Developer", companyRedacted: "[REDACTED]", startMonth: "2023-01", endMonth: "2025-01", isCurrent: true, responsibilities: ["Phát triển API"], evidenceIds: ["old-evidence"] }],
    education: [{ institutionRedacted: "[REDACTED]", degreeLevel: "BACHELOR", fieldOfStudy: "CNTT", startMonth: "2019-09", endMonth: "2023-06" }],
    projects: [{ name: "Dự án tổng hợp", description: "React và Spring Boot" }],
    certificates: [{ name: "Chứng chỉ mẫu", issuer: "Đơn vị mẫu", issuedMonth: "2024-01" }],
    languages: [{ languageCode: "en", proficiency: "B2" }],
    summary: { totalExperienceMonths: 24 },
  } as ParsedCvPayload;
  const original = JSON.stringify(parsed);
  const imported = importParsedCv(doc, parsed);
  expect(imported.fullName).toBe(doc.fullName);
  expect(imported.email).toBe(doc.email);
  expect(imported.experiences[0]).toMatchObject({ title: "Backend Developer", subtitle: "", endMonth: "", current: true });
  expect(imported.education[0].title).toBe("Đại học - CNTT");
  expect(imported.languages[0].title).toBe("Tiếng Anh");
  expect(JSON.stringify(imported)).not.toMatch(/old-evidence|REDACTED|canonicalSkillId|sourceHash/);
  expect(JSON.stringify(parsed)).toBe(original);
  expect(doc.experiences).toEqual([]);
});

it("profile prefill fills available display data without erasing typed fields when profile fields are null", () => {
  const doc = {
    ...createCvDocument(),
    headline: "Kỹ sư đã nhập tay",
    introduction: "Giới thiệu viết tay",
    skills: "Java, SQL",
  };
  const profile = {
    displayName: "Ứng viên mẫu",
    headline: null,
    phoneNumber: null,
    contactEmail: "demo@example.invalid",
    bio: null,
    locationText: "Hà Nội",
    linkedinUrl: null,
    githubUrl: "https://example.invalid/demo",
    portfolioUrl: null,
  } as CandidateProfile;
  const next = prefillCvProfile(doc, profile);
  expect(next).toMatchObject({
    fullName: "Ứng viên mẫu",
    email: profile.contactEmail,
    skills: "Java, SQL",
    headline: "Kỹ sư đã nhập tay",
    introduction: "Giới thiệu viết tay",
    links: profile.githubUrl,
  });
  next.fullName = "Đã sửa";
  expect(profile.displayName).toBe("Ứng viên mẫu");
});

it("throws CvImportLimitError with section detail when imported sections exceed cap", () => {
  const parsed = {
    skills: [],
    experiences: [],
    education: [],
    languages: [],
    certificates: [],
    projects: Array.from({ length: 21 }, () => ({ name: "Dự án", description: null })),
  } as unknown as ParsedCvPayload;
  expect(() => importParsedCv(createCvDocument(), parsed)).toThrow(CvImportLimitError);
  expect(() => importParsedCv(createCvDocument(), parsed)).toThrow(/Dự án/);
});
