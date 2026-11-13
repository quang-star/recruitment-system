import type { CandidateProfile } from "../CandidateProfilePage";
import type { ParsedCvPayload } from "../ParsedCvReview";
import { createCvEntry, validateCvDocument, type CvDocument } from "./cvDocument";

/** Copy profile display fields only on request. This never updates the profile. */
export function prefillCvProfile(doc: CvDocument, profile: CandidateProfile): CvDocument {
  return validateCvDocument({
    ...doc,
    fullName: profile.displayName ?? "",
    headline: profile.headline ?? "",
    email: profile.contactEmail ?? "",
    phone: profile.phoneNumber ?? "",
    location: profile.locationText ?? "",
    links: [profile.linkedinUrl, profile.githubUrl, profile.portfolioUrl].filter(Boolean).join("\n"),
    introduction: profile.bio ?? ""
  });
}

const degreeLabels: Record<string, string> = {
  HIGH_SCHOOL: "THPT", VOCATIONAL: "Trung cấp", ASSOCIATE: "Cao đẳng",
  BACHELOR: "Đại học", MASTER: "Thạc sĩ", DOCTORATE: "Tiến sĩ"
};
const languageLabels: Record<string, string> = { vi: "Tiếng Việt", en: "Tiếng Anh", ja: "Tiếng Nhật", ko: "Tiếng Hàn", zh: "Tiếng Trung" };

/** Imported display content is a new authoring draft; parser evidence never crosses. */
export function importParsedCv(doc: CvDocument, parsed: ParsedCvPayload): CvDocument {
  const next: CvDocument = {
    ...doc,
    skills: (parsed.skills ?? []).map(item => item.raw).join(", "),
    experiences: (parsed.experiences ?? []).map(item => ({
      ...createCvEntry(), title: item.titleRaw ?? "", description: (item.responsibilities ?? []).join("\n"),
      startMonth: item.startMonth ?? "", endMonth: item.isCurrent ? "" : (item.endMonth ?? ""), current: item.isCurrent ?? false
    })),
    education: (parsed.education ?? []).map(item => ({
      ...createCvEntry(), title: [degreeLabels[item.degreeLevel ?? ""] ?? item.degreeLevel, item.fieldOfStudy].filter(Boolean).join(" - "),
      startMonth: item.startMonth ?? "", endMonth: item.endMonth ?? ""
    })),
    projects: (parsed.projects ?? []).map(item => ({ ...createCvEntry(), title: item.name ?? "", description: item.description ?? "" })),
    certificates: (parsed.certificates ?? []).map(item => ({
      ...createCvEntry(), title: item.name ?? "", subtitle: item.issuer ?? "", startMonth: item.issuedMonth ?? ""
    })),
    languages: (parsed.languages ?? []).map(item => ({
      ...createCvEntry(), title: languageLabels[item.languageCode] ?? item.languageCode, subtitle: item.proficiency ?? ""
    }))
  };
  // Deliberately do not recover company/institution names from redacted fields,
  // nor copy summary confidence, canonical IDs, source hashes or evidence IDs.
  return validateCvDocument(next);
}
