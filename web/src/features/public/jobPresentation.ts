import { PublicJob } from "./types";

export function publishedLabel(job: PublicJob) {
  const timestamp = job.publishedAt ? Date.parse(job.publishedAt) : NaN;
  return Number.isFinite(timestamp) ? `Đăng ${new Date(timestamp).toLocaleDateString("vi-VN")}` : "Chưa cập nhật ngày đăng";
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
  const text = `${requirements || ""} ${description || ""} ${title || ""}`;
  const candidates = [
    "Java", "Spring Boot", "React", "Next.js", "TypeScript", "JavaScript",
    "PostgreSQL", "Docker", "Kubernetes", "OpenStack", "Terraform", "Ceph",
    "Linux", "TailwindCSS", "Vitest", "C/C++", "AUTOSAR", "Embedded", "ARM",
    "Python", "PyTorch", "TensorFlow", "FastAPI", "NLP", "LLM", "Kafka",
    "Redis", "Microservices", "Event Sourcing", "DDD", "Go", "Elasticsearch",
    "Milvus", "Vector DB", "Delta Lake", "Spark", "Airflow", "SQL", "AWS"
  ];
  const matched = candidates.filter((c) => {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^a-zA-Z0-9_#])${escaped}($|[^a-zA-Z0-9_#])`, "i");
    return regex.test(text);
  });
  return matched.length > 0 ? matched.slice(0, 5) : ["Công nghệ thông tin", "Kỹ thuật phần mềm"];
}
