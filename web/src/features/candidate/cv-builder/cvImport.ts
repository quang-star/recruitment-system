import type { CandidateProfile } from "../CandidateProfilePage";
import type { ParsedCvPayload } from "../ParsedCvReview";
import { createCvEntry, MAX_SECTION_ENTRIES, validateCvDocument, type CvDocument } from "./cvDocument";

function pickNonBlank(incoming: string | null | undefined, current: string): string {
  return incoming && incoming.trim() ? incoming.trim() : current;
}

/** Copy non-empty profile display fields only on request without blanking manual input. */
export function prefillCvProfile(doc: CvDocument, profile: CandidateProfile): CvDocument {
  const profileLinks = [profile.linkedinUrl, profile.githubUrl, profile.portfolioUrl]
    .map(value => value?.trim())
    .filter(Boolean)
    .join("\n");
  return validateCvDocument({
    ...doc,
    fullName: pickNonBlank(profile.displayName, doc.fullName),
    headline: pickNonBlank(profile.headline, doc.headline),
    email: pickNonBlank(profile.contactEmail, doc.email),
    phone: pickNonBlank(profile.phoneNumber, doc.phone),
    location: pickNonBlank(profile.locationText, doc.location),
    links: pickNonBlank(profileLinks, doc.links),
    introduction: pickNonBlank(profile.bio, doc.introduction),
  });
}

const degreeLabels: Record<string, string> = {
  HIGH_SCHOOL: "THPT", VOCATIONAL: "Trung cấp", ASSOCIATE: "Cao đẳng",
  BACHELOR: "Đại học", MASTER: "Thạc sĩ", DOCTORATE: "Tiến sĩ",
};
const languageLabels: Record<string, string> = {
  vi: "Tiếng Việt", en: "Tiếng Anh", ja: "Tiếng Nhật", ko: "Tiếng Hàn", zh: "Tiếng Trung",
};

export class CvImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CvImportLimitError";
  }
}

/** Imported display content is a new authoring draft; parser evidence never crosses. */
export function importParsedCv(doc: CvDocument, parsed: ParsedCvPayload): CvDocument {
  const checks: [string, number][] = [
    ["Kinh nghiệm", parsed.experiences?.length ?? 0],
    ["Học vấn", parsed.education?.length ?? 0],
    ["Dự án", parsed.projects?.length ?? 0],
    ["Chứng chỉ", parsed.certificates?.length ?? 0],
    ["Ngoại ngữ", parsed.languages?.length ?? 0],
  ];
  const oversized = checks.find(([, count]) => count > MAX_SECTION_ENTRIES);
  if (oversized) {
    throw new CvImportLimitError(
      `CV nguồn có ${oversized[1]} mục "${oversized[0]}", vượt giới hạn tối đa ${MAX_SECTION_ENTRIES} mục của trình tạo CV.`,
    );
  }
  const next: CvDocument = {
    ...doc,
    skills: (parsed.skills ?? []).map(item => item.raw).join(", "),
    experiences: (parsed.experiences ?? []).map(item => ({
      ...createCvEntry(),
      title: item.titleRaw ?? "",
      subtitle: "",
      description: (item.responsibilities ?? []).join("\n"),
      startMonth: item.startMonth ?? "",
      endMonth: item.isCurrent ? "" : (item.endMonth ?? ""),
      current: item.isCurrent ?? false,
    })),
    education: (parsed.education ?? []).map(item => ({
      ...createCvEntry(),
      title: [degreeLabels[item.degreeLevel ?? ""] ?? item.degreeLevel, item.fieldOfStudy].filter(Boolean).join(" - "),
      subtitle: "",
      startMonth: item.startMonth ?? "",
      endMonth: item.endMonth ?? "",
      current: false,
      description: "",
    })),
    projects: (parsed.projects ?? []).map(item => ({
      ...createCvEntry(),
      title: item.name ?? "",
      subtitle: "",
      startMonth: "",
      endMonth: "",
      current: false,
      description: item.description ?? "",
    })),
    certificates: (parsed.certificates ?? []).map(item => ({
      ...createCvEntry(),
      title: item.name ?? "",
      subtitle: item.issuer ?? "",
      startMonth: item.issuedMonth ?? "",
      endMonth: "",
      current: false,
      description: "",
    })),
    languages: (parsed.languages ?? []).map(item => ({
      ...createCvEntry(),
      title: languageLabels[item.languageCode] ?? item.languageCode,
      subtitle: item.proficiency ?? "",
      startMonth: "",
      endMonth: "",
      current: false,
      description: "",
    })),
  };
  try {
    return validateCvDocument(next);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("exceeds") || message.includes("maximum")) {
      throw new CvImportLimitError("Nội dung CV nguồn vượt giới hạn độ dài cho phép (tối đa 256 KiB).");
    }
    throw error;
  }
}
