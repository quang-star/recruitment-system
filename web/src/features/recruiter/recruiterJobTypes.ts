import { ApiClientError } from "../../shared/api/client";
import { externalAiPolicyVersion } from "../../shared/components/ExternalAiConsent";
import type { BadgeTone } from "../../shared/ui";
import { CategoryChoice, defaultCategory } from "./JobCategoryFields";

export type Job = {
  jobId: string;
  companyId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  version: number;
  jobVersionId: string;
  jobVersionNumber: number;
  title: string;
  description: string;
  requirementsText: string;
  benefitsText: string | null;
  locationText: string | null;
  province?: string | null;
  countryCode: string | null;
  workMode: "ONSITE" | "HYBRID" | "REMOTE" | null;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | null;
  seniorityLevel: string | null;
  openings: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryNegotiable: boolean;
  applicationDeadline: string | null;
  externalAiConsent?: boolean;
  externalAiPolicyVersion?: string | null;
  sourceHash: string;
  category?: CategoryChoice;
  matchingSupported?: boolean;
};

export type JobForm = {
  title: string;
  description: string;
  requirementsText: string;
  benefitsText: string;
  locationText: string;
  province: string;
  countryCode: string;
  workMode: string;
  employmentType: string;
  seniorityLevel: string;
  openings: number;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  salaryNegotiable: boolean;
  applicationDeadline: string;
  externalAiConsent: boolean;
  category: CategoryChoice;
};

export type JdSkill = {
  raw: string;
  canonicalSkillId: string | null;
  normalizationStatus: "KNOWN" | "PENDING" | "UNRESOLVED";
  criticality: "CRITICAL" | "NORMAL";
  minimumMonths: number | null;
  evidenceIds: string[];
  confidence: number;
  confirmedByRecruiter: boolean;
};

export type ParsedJd = {
  revisionId: string;
  jobId: string;
  jobVersionId: string;
  revisionNumber: number;
  sourceHash: string;
  status: "PARSED" | "CONFIRMED" | "SUPERSEDED";
  payload: {
    [key: string]: unknown;
    document: { jobVersionId: string; language: string; sourceHash: string; parserVersion: string };
    title: { raw: string; canonicalFamily: string | null; level: string | null; confidence: number; evidenceIds: string[] };
    requirements: {
      requiredSkills: JdSkill[];
      preferredSkills: JdSkill[];
      minimumRelevantExperienceMonths: number | null;
      education: Array<Record<string, unknown>>;
      languages: Array<Record<string, unknown>>;
    };
    responsibilities: Array<Record<string, unknown> & { raw: string }>;
    overallConfidence: number;
    qualityFlags: string[];
  };
  confirmedBy: string | null;
  confirmedAt: string | null;
  version: number;
};

export type WorkspaceTab = "pipeline" | "editor" | "review" | "preview" | "analytics";

export const emptyJob: JobForm = {
  title: "",
  description: "",
  requirementsText: "",
  benefitsText: "",
  locationText: "",
  province: "",
  countryCode: "VN",
  workMode: "",
  employmentType: "FULL_TIME",
  seniorityLevel: "",
  openings: 1,
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "VND",
  salaryPeriod: "MONTH",
  salaryNegotiable: false,
  applicationDeadline: "",
  externalAiConsent: false,
  category: defaultCategory
};

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso.slice(0, 16);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toForm(job: Job): JobForm {
  return {
    title: job.title,
    description: job.description,
    requirementsText: job.requirementsText,
    benefitsText: job.benefitsText ?? "",
    locationText: job.locationText ?? "",
    province: job.province ?? "",
    countryCode: job.countryCode ?? "VN",
    workMode: job.workMode ?? "",
    employmentType: job.employmentType ?? "FULL_TIME",
    seniorityLevel: job.seniorityLevel ?? "",
    openings: job.openings,
    salaryMin: job.salaryMin?.toString() ?? "",
    salaryMax: job.salaryMax?.toString() ?? "",
    salaryCurrency: job.salaryCurrency ?? "VND",
    salaryPeriod: job.salaryPeriod ?? "MONTH",
    salaryNegotiable: job.salaryNegotiable,
    applicationDeadline: toLocalDateTimeInput(job.applicationDeadline),
    externalAiConsent: job.externalAiConsent === true && job.externalAiPolicyVersion === externalAiPolicyVersion,
    category: job.category ?? { ...defaultCategory, positionName: job.title }
  };
}

export function getJobErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}

const commonTechs = [
  "Java",
  "Kafka",
  "Spring Boot",
  "React",
  "Python",
  "Docker",
  "PostgreSQL",
  "AWS",
  "TypeScript",
  "Node.js",
  "AI",
  "Go",
  "SQL",
  "Kubernetes",
  "C#",
  ".NET",
  "Vue",
  "Angular"
];

export function extractJobSkills(text: string): string[] {
  return commonTechs.filter((tech) => new RegExp(`\\b${tech.replace(".", "\\.")}\\b`, "i").test(text));
}

function formatSalaryValue(amount: number, currency: string): string {
  if (currency === "VND") {
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(amount / 1_000_000)} triệu`;
  }
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function formatJobSalary(job: Pick<Job, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod" | "salaryNegotiable">): string | null {
  if (job.salaryNegotiable) return "Lương thỏa thuận";
  const currency = job.salaryCurrency ?? "VND";
  const periodSuffix = job.salaryPeriod === "YEAR" ? "/năm" : job.salaryPeriod === "HOUR" ? "/giờ" : "/tháng";
  if (job.salaryMin != null && job.salaryMax != null) {
    return `${formatSalaryValue(job.salaryMin, currency)} - ${formatSalaryValue(job.salaryMax, currency)} ${currency === "VND" ? "VND" : ""}${periodSuffix}`.replace(/\s+/g, " ").trim();
  }
  if (job.salaryMin != null) {
    return `Từ ${formatSalaryValue(job.salaryMin, currency)}${currency === "VND" ? " VND" : ""}${periodSuffix}`;
  }
  if (job.salaryMax != null) {
    return `Đến ${formatSalaryValue(job.salaryMax, currency)}${currency === "VND" ? " VND" : ""}${periodSuffix}`;
  }
  return null;
}

export function jobStatusLabel(status: Job["status"]): string {
  if (status === "PUBLISHED") return "Đang đăng";
  if (status === "DRAFT") return "Bản nháp";
  return "Đã đóng";
}

export function jobStatusTone(status: Job["status"]): BadgeTone {
  if (status === "PUBLISHED") return "success";
  if (status === "DRAFT") return "warning";
  return "neutral";
}
