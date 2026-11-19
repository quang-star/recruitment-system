import { ApiClientError } from "../../shared/api/client";
import type { ApplicationMatch } from "../application/MatchBreakdown";
import type { MatchState } from "../application/matchPresentation";

export type Job = {
  jobId: string;
  title: string;
  description: string;
  requirementsText: string;
  locationText: string | null;
  workMode: string | null;
  employmentType: string | null;
  openings: number;
  companyId: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  salaryNegotiable?: boolean;
  matchingSupported?: boolean;
};

export type Cv = {
  cvId: string;
  title: string;
  activeVersion: {
    cvVersionId: string;
    processingStatus: string;
    originalFilename?: string;
  };
};

export type Application = {
  applicationId: string;
  jobTitle?: string | null;
  companyName?: string | null;
  jobId: string;
  cvId?: string;
  cvVersionId?: string;
  status: string;
  appliedAt: string;
  version: number;
  matchingSupported?: boolean;
  cvAccessGranted?: boolean;
  match?: ApplicationMatch | null;
  matchState?: MatchState;
};

export type StatusChange = {
  statusChangeId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  occurredAt: string;
};

export const APPLICATION_STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "SUBMITTED", label: "Mới ứng tuyển" },
  { value: "UNDER_REVIEW", label: "Đang xem xét" },
  { value: "SHORTLISTED", label: "Danh sách rút gọn" },
  { value: "INTERVIEW", label: "Đang phỏng vấn" },
  { value: "OFFERED", label: "Đã gửi đề nghị tuyển dụng" },
  { value: "HIRED", label: "Đã tuyển dụng" },
  { value: "REJECTED", label: "Đã từ chối" },
  { value: "WITHDRAWN", label: "Đã rút" }
];

export function applicationStatusLabel(status: string): string {
  return (
    ({
      SUBMITTED: "Mới ứng tuyển",
      UNDER_REVIEW: "Đang xem xét",
      SHORTLISTED: "Danh sách rút gọn",
      INTERVIEW: "Đang phỏng vấn",
      OFFERED: "Đã gửi đề nghị tuyển dụng",
      HIRED: "Đã tuyển dụng",
      REJECTED: "Đã từ chối",
      WITHDRAWN: "Đã rút"
    } as Record<string, string>)[status] ?? status
  );
}

export function applicationStatusTone(status: string): "info" | "warning" | "success" | "danger" | "neutral" {
  switch (status) {
    case "SHORTLISTED":
    case "HIRED":
      return "success";
    case "UNDER_REVIEW":
    case "INTERVIEW":
    case "OFFERED":
      return "warning";
    case "REJECTED":
      return "danger";
    case "WITHDRAWN":
      return "neutral";
    default:
      return "info";
  }
}

export function workModeLabel(mode: string | null | undefined): string | null {
  if (!mode) return null;
  return ({ ONSITE: "Tại văn phòng", HYBRID: "Hybrid", REMOTE: "Từ xa" } as Record<string, string>)[mode] ?? mode;
}

export function employmentTypeLabel(type: string | null | undefined): string | null {
  if (!type) return null;
  return (
    ({
      FULL_TIME: "Toàn thời gian",
      PART_TIME: "Bán thời gian",
      INTERNSHIP: "Thực tập",
      CONTRACT: "Hợp đồng"
    } as Record<string, string>)[type] ?? type
  );
}

export function formatSalary(job: Job): string {
  if (job.salaryNegotiable && !job.salaryMin && !job.salaryMax) return "Thỏa thuận";
  const currency = job.salaryCurrency || "VND";
  const unit = currency === "VND" ? "tr" : ` ${currency}`;
  const fmt = (value: number) =>
    currency === "VND" && value >= 1_000_000 ? `${Math.round(value / 1_000_000)}` : `${value}`;
  if (job.salaryMin && job.salaryMax) return `${fmt(job.salaryMin)}–${fmt(job.salaryMax)}${unit}`;
  if (job.salaryMin) return `Từ ${fmt(job.salaryMin)}${unit}`;
  if (job.salaryMax) return `Đến ${fmt(job.salaryMax)}${unit}`;
  return job.salaryNegotiable ? "Thỏa thuận" : "Theo năng lực";
}

export function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}

export const inputClass =
  "h-10 w-full rounded-md border border-border-strong bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";
