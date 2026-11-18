import { ApiClientError } from "../../shared/api/client";
import type { BadgeTone } from "../../shared/ui";
import type { ApplicationMatch } from "../application/MatchBreakdown";
import type { MatchState } from "../application/matchPresentation";

export type Application = {
  applicationId: string;
  candidateUserId: string;
  coverLetter: string | null;
  status: string;
  appliedAt: string;
  version: number;
  matchingSupported?: boolean;
  cvAccessGranted?: boolean;
  candidateName?: string | null;
  candidateHeadline?: string | null;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
};

export type ApplicationWithMatch = Application & {
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

export type PipelineStage = {
  key: "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "REJECTED";
  label: string;
  topBorderClass: string;
  iconColorClass: string;
  countClass: string;
};

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    key: "SUBMITTED",
    label: "Mới ứng tuyển",
    topBorderClass: "border-t-sky-500",
    iconColorClass: "text-sky-600",
    countClass: "bg-sky-50 text-sky-700 border-sky-200"
  },
  {
    key: "UNDER_REVIEW",
    label: "Đang xem xét",
    topBorderClass: "border-t-amber-500",
    iconColorClass: "text-amber-600",
    countClass: "bg-amber-50 text-amber-800 border-amber-200"
  },
  {
    key: "SHORTLISTED",
    label: "Danh sách rút gọn",
    topBorderClass: "border-t-emerald-600",
    iconColorClass: "text-emerald-600",
    countClass: "bg-emerald-50 text-emerald-700 border-emerald-200"
  },
  {
    key: "REJECTED",
    label: "Đã từ chối",
    topBorderClass: "border-t-slate-400",
    iconColorClass: "text-ink-500",
    countClass: "bg-slate-100 text-ink-700 border-slate-200"
  }
];

export const STAGE_PILLS = [
  { value: "", label: "Tất cả" },
  { value: "SUBMITTED", label: "Mới nộp" },
  { value: "UNDER_REVIEW", label: "Đang xem xét" },
  { value: "SHORTLISTED", label: "Shortlist" },
  { value: "REJECTED", label: "Đã từ chối" },
  { value: "WITHDRAWN", label: "Đã rút" }
];

export const controlClass =
  "mt-1 h-9 w-full rounded-xl border border-border-strong bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function statusTone(status: string): BadgeTone {
  if (status === "SHORTLISTED" || status === "HIRED") return "success";
  if (status === "INTERVIEW" || status === "OFFERED") return "brand";
  if (status === "UNDER_REVIEW") return "warning";
  if (status === "REJECTED") return "danger";
  if (status === "SUBMITTED") return "info";
  return "neutral";
}

export function candidateInitials(application: Application): string {
  return application.candidateName
    ? application.candidateName.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase() || "UV"
    : application.candidateUserId.slice(0, 2).toUpperCase();
}

export function candidateDisplayName(application: Application): string {
  return application.candidateName || `Ứng viên ${application.candidateUserId.slice(0, 8)}…`;
}

export function translateApplicationStatus(status: string): string {
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

export type RecruiterTransition = Exclude<PipelineStage["key"], "SUBMITTED" | "REJECTED">;

export const nextRecruitmentStage: Partial<Record<string, RecruiterTransition>> = {
  SUBMITTED: "UNDER_REVIEW",
  UNDER_REVIEW: "SHORTLISTED"
};

export function screeningStageFor(status: string): string {
  return ["INTERVIEW", "OFFERED", "HIRED"].includes(status) ? "SHORTLISTED" : status;
}

export function canRejectApplication(status: string): boolean {
  return ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "OFFERED"].includes(status);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể tải danh sách ứng viên.";
}
