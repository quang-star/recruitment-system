import { PublicJob } from "./types";

export function publishedLabel(job: PublicJob) {
  const timestamp = job.publishedAt ? Date.parse(job.publishedAt) : NaN;
  if (!Number.isFinite(timestamp)) return "Chưa cập nhật ngày đăng";

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return `Đăng ${new Date(timestamp).toLocaleDateString("vi-VN")}`;
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Vừa đăng";
  if (minutes < 60) return `${minutes} phút trước`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;

  return `Đăng ${new Date(timestamp).toLocaleDateString("vi-VN")}`;
}

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function formatSalary(job: PublicJob) {
  if (job.salaryNegotiable) return "Lương thỏa thuận";
  const currency = job.salaryCurrency || "VND";
  const format = (amount: number) => currency === "VND"
    ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(amount / 1000000)} triệu`
    : new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(amount);
  if (job.salaryMin != null && job.salaryMax != null) return `${format(job.salaryMin)} – ${format(job.salaryMax)}`;
  if (job.salaryMin != null) return `Từ ${format(job.salaryMin)}`;
  if (job.salaryMax != null) return `Đến ${format(job.salaryMax)}`;
  return "Lương thỏa thuận";
}

export function formatSalaryWithPeriod(job: PublicJob): string {
  const base = formatSalary(job);
  if (job.salaryNegotiable || (job.salaryMin == null && job.salaryMax == null) || !job.salaryPeriod) {
    return base;
  }
  const periodLabel = job.salaryPeriod === "YEAR" ? "năm" : job.salaryPeriod === "HOUR" ? "giờ" : "tháng";
  return `${base} / ${periodLabel}`;
}

export function deadlineRemainingLabel(deadlineIso?: string | null): string | null {
  if (!deadlineIso) return null;
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(deadlineMs)) return null;
  const diffDays = Math.ceil((deadlineMs - Date.now()) / 86_400_000);
  if (diffDays < 0) return "Đã hết hạn nộp";
  if (diffDays === 0) return "Hạn nộp hôm nay";
  return `Còn ${diffDays} ngày`;
}

export function countryLabel(countryCode?: string): string | null {
  const trimmed = countryCode?.trim().toUpperCase();
  if (!trimmed) return null;
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      return new Intl.DisplayNames(["vi"], { type: "region" }).of(trimmed) ?? trimmed;
    }
  } catch {
    // Fallback to raw ISO code if locale region display is unavailable
  }
  return trimmed;
}

export function formatJobLocation(
  job: { province?: string | null; locationText?: string | null },
  mode: "short" | "full" = "short",
  fallback = "Linh hoạt"
): string {
  const province = job.province?.trim() || "";
  const locationText = job.locationText?.trim() || "";
  if (mode === "short") {
    return province || locationText || fallback;
  }
  if (locationText && province) {
    if (locationText.toLowerCase().includes(province.toLowerCase())) {
      return locationText;
    }
    return `${locationText}, ${province}`;
  }
  return province || locationText || fallback;
}

export function workModeLabel(value: string | null) {
  return ({ REMOTE: "Từ xa", HYBRID: "Hybrid", ONSITE: "Tại văn phòng" } as Record<string, string>)[value ?? ""] ?? value ?? "Linh hoạt";
}

export function employmentTypeLabel(value: string | null) {
  return ({ FULL_TIME: "Toàn thời gian", PART_TIME: "Bán thời gian", CONTRACT: "Hợp đồng", INTERNSHIP: "Thực tập", FREELANCE: "Freelance" } as Record<string, string>)[value ?? ""] ?? value ?? "Toàn thời gian";
}

export function seniorityLabel(value: string | null) {
  return ({ INTERN: "Thực tập", FRESHER: "Fresher", JUNIOR: "Junior", MIDDLE: "Chuyên viên", SENIOR: "Senior", LEAD: "Trưởng nhóm", MANAGER: "Quản lý" } as Record<string, string>)[value ?? ""] ?? value ?? "Không yêu cầu cấp bậc";
}

export function extractSkillsFromJob(
  requirements?: string | null,
  description?: string | null,
  title?: string | null
): string[] {
  const texts = [requirements ?? "", description ?? "", title ?? ""];
  const candidates = [
    "Java", "Spring Boot", "React", "Next.js", "TypeScript", "JavaScript",
    "PostgreSQL", "Docker", "Kubernetes", "OpenStack", "Terraform", "Ceph",
    "Linux", "TailwindCSS", "Vitest", "C/C++", "AUTOSAR", "Embedded", "ARM",
    "Python", "PyTorch", "TensorFlow", "FastAPI", "NLP", "LLM", "Kafka",
    "Redis", "Microservices", "Event Sourcing", "DDD", "Go", "Elasticsearch",
    "Milvus", "Vector DB", "Delta Lake", "Spark", "Airflow", "SQL", "AWS",
    "Node.js", "Vue.js", "Angular", "ASP.NET Core", ".NET", "C#", "Golang",
    "PHP", "Laravel", "Kotlin", "Android", "Swift", "iOS", "Flutter",
    "React Native", "Spring Security", "Hibernate", "MySQL", "MongoDB",
    "Oracle", "SQL Server", "RabbitMQ", "GraphQL", "gRPC", "Azure", "GCP",
    "CI/CD", "GitLab CI", "GitHub Actions", "Playwright", "Selenium",
    "Cypress", "JUnit", "HTML", "CSS", "Tailwind CSS", "Scrum"
  ];
  const matched = candidates.filter((c) => {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefix = c.startsWith(".") ? "(^|[\\s,(/;•|-])" : "(^|[^\\p{L}\\p{M}\\p{N}_#.])";
    const regex = new RegExp(`${prefix}${escaped}($|[^\\p{L}\\p{M}\\p{N}_#])`, "iu");
    return texts.some((text) => regex.test(text));
  });
  return matched.slice(0, 5);
}
