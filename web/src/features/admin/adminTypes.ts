import type { CategoryEntry } from "../recruiter/JobCategoryFields";

export const skillTypes = [
  "language",
  "framework",
  "library",
  "database",
  "cloud",
  "devops",
  "testing",
  "data_ai",
  "security",
  "methodology",
  "soft_skill",
  "other"
] as const;

export const skillCategories = [
  "backend",
  "frontend",
  "fullstack",
  "mobile",
  "devops",
  "data_ai",
  "qa",
  "security",
  "cross_functional"
] as const;

export const relationTypes = ["BROADER", "NARROWER", "RELATED", "SUPERSEDES"] as const;

export type SkillRelation = { type: (typeof relationTypes)[number]; targetSkillId: string };

export type Skill = {
  stableId: string;
  canonicalName: string;
  status: string;
  aliases: Array<{ value: string }>;
  type: (typeof skillTypes)[number];
  category: (typeof skillCategories)[number];
  relations: SkillRelation[];
  redacted?: boolean;
};

export type SkillCatalog = { version: number; taxonomyVersion: string; skills: Skill[] };
export type Action = "CREATE" | "EDIT" | "APPROVE" | "REJECT" | "MERGE" | "DEFER" | "REOPEN";
export type AdminTab = "categories" | "skills" | "audit" | "companies";

export type HistoryEntry = {
  id?: string | number;
  action: string;
  actorId?: string | null;
  actorUserId?: string | null;
  version?: number | null;
  reason?: string | null;
  correlationId?: string | null;
  redacted?: boolean;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  beforeState?: string;
  afterState?: string;
  createdAt?: string;
  occurredAt?: string;
};

export const validAdminTabs: readonly AdminTab[] = ["categories", "skills", "audit", "companies"];

export const adminRouteMap: Record<AdminTab, string> = {
  categories: "/admin",
  skills: "/admin/skills",
  audit: "/admin/audit",
  companies: "/admin/companies"
};

export const adminPageTitle: Record<AdminTab, string> = {
  categories: "Ngành nghề và vị trí",
  skills: "Kỹ năng và tên gọi khác",
  audit: "Nhật ký thay đổi",
  companies: "Duyệt công ty"
};

export const catalogStatusLabel: Record<string, string> = {
  PENDING: "Chờ duyệt",
  ACTIVE: "Đang hoạt động",
  DEFERRED: "Tạm hoãn",
  REJECTED: "Đã từ chối",
  MERGED: "Đã gộp"
};

/** Maps admin route path or legacy `?admin=` query param to a typed workbench tab. */
export function resolveAdminTab(pathname: string, search: string): AdminTab {
  const queryTab = new URLSearchParams(search).get("admin");
  if (queryTab && validAdminTabs.includes(queryTab as AdminTab)) {
    return queryTab as AdminTab;
  }
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/admin/skills") return "skills";
  if (normalized === "/admin/audit") return "audit";
  if (normalized === "/admin/companies") return "companies";
  return "categories";
}

export const fieldClass =
  "mt-1 h-10 w-full rounded-xl border border-border-strong bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-ink-500";
export const textareaClass =
  "mt-1 w-full rounded-xl border border-border-strong bg-white p-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-ink-500";
export const labelClass = "block text-xs font-semibold text-ink-700";

export const legacyMissing = "Chưa được ghi (dữ liệu cũ)";

export const categoryLabel: Record<CategoryEntry["kind"], string> = {
  INDUSTRY: "Ngành",
  SPECIALIZATION: "Nhóm chuyên môn",
  POSITION: "Vị trí"
};

export const actionLabel: Record<string, string> = {
  CREATE: "Thêm",
  PROPOSE: "Đề xuất",
  EDIT: "Sửa",
  APPROVE: "Duyệt",
  REJECT: "Từ chối",
  MERGE: "Gộp",
  DEFER: "Tạm hoãn",
  REOPEN: "Mở lại"
};

export const skillTypeLabel: Record<string, string> = {
  language: "Ngôn ngữ",
  framework: "Framework",
  library: "Thư viện",
  database: "Cơ sở dữ liệu",
  cloud: "Cloud",
  devops: "DevOps",
  testing: "Kiểm thử",
  data_ai: "Dữ liệu / AI",
  security: "Bảo mật",
  methodology: "Phương pháp",
  soft_skill: "Kỹ năng mềm",
  other: "Khác"
};

export const skillCategoryLabel: Record<string, string> = {
  backend: "Backend",
  frontend: "Frontend",
  fullstack: "Fullstack",
  mobile: "Mobile",
  devops: "DevOps",
  data_ai: "Dữ liệu / AI",
  qa: "QA",
  security: "Bảo mật",
  cross_functional: "Liên chức năng"
};

export const relationLabel: Record<SkillRelation["type"], string> = {
  BROADER: "Rộng hơn",
  NARROWER: "Hẹp hơn",
  RELATED: "Liên quan",
  SUPERSEDES: "Thay thế"
};

/** Formats an audit timestamp or returns the explicit missing-legacy-data placeholder. */
export function historyTime(value: string | undefined): string {
  const timestamp = value ? new Date(value) : null;
  return timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.toLocaleString("vi-VN") : legacyMissing;
}

/** Parses serialized before/after JSON snapshots safely without throwing on malformed records. */
export function historyState(value: Record<string, unknown> | string | undefined): Record<string, unknown> | null {
  if (typeof value !== "string") return value ?? null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
