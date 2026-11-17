import { useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CompanyIcon,
  CvIcon,
  JobsIcon,
  NotificationIcon,
  ProfileIcon,
  SecurityIcon,
  SparklesIcon
} from "../../shared/components/Icon";
import { Badge, Button, Card, ErrorBanner, Skeleton } from "../../shared/ui";

type Dashboard = {
  audience: "CANDIDATE" | "RECRUITER";
  metrics: Record<string, number>;
  pendingJobId?: string | null;
  pendingJobTitle?: string | null;
};

type Job = {
  jobId: string;
  title: string;
  locationText: string | null;
  workMode: string | null;
  employmentType: string | null;
  requirementsText: string;
  openings: number;
  status?: string;
  jobVersionNumber?: number;
};

type Props = {
  session: AuthSession;
  companyId?: string | null;
  onLogout: () => void;
  onNavigate?: (view: string) => void;
  candidateName?: string | null;
  onOpenJob?: (jobId: string) => void;
};

const labels: Record<string, string> = {
  cvs: "CV",
  applications: "Hồ sơ ứng tuyển",
  submitted: "Mới nộp",
  underReview: "Đang xem xét",
  shortlisted: "Shortlist",
  rejected: "Đã từ chối",
  jobs: "Tin tuyển dụng",
  publishedJobs: "Đang đăng",
  draftJobs: "Bản nháp",
  closedJobs: "Đã đóng",
  unreadNotifications: "Thông báo chưa đọc"
};

const commonTechs = ["Java", "Kafka", "Spring Boot", "React", "Python", "Docker", "PostgreSQL", "TypeScript", "AWS"];

function extractSkills(text: string): string[] {
  return commonTechs.filter((tech) => new RegExp(`\\b${tech}\\b`, "i").test(text));
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function DashboardPanel({ session, companyId, onLogout, onNavigate, onOpenJob, candidateName }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isRecruiter = session.roles.includes("RECRUITER");

  useEffect(() => {
    let active = true;
    if (isRecruiter && !companyId) {
      setDashboard(null);
      return () => {
        active = false;
      };
    }
    const path = companyId ? `/api/v2/dashboard?companyId=${companyId}` : "/api/v2/dashboard";

    void apiRequest<Dashboard>(path, { accessToken: session.accessToken })
      .then((result) => {
        if (!active) return;
        setDashboard(result);
        if (result.audience === "CANDIDATE") {
          apiRequest<PageResult<Job>>("/api/v2/candidate/jobs?page=0&size=3", { accessToken: session.accessToken })
            .then((jobs) => {
              if (active) setRecentJobs(jobs.items);
            })
            .catch(() => {});
        } else if (result.audience === "RECRUITER" && companyId) {
          apiRequest<PageResult<Job>>(`/api/v2/companies/${companyId}/jobs?page=0&size=4`, {
            accessToken: session.accessToken
          })
            .then((jobs) => {
              if (active) setRecentJobs(jobs.items);
            })
            .catch(() => {});
        }
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
        else setError(requestError instanceof ApiClientError ? requestError.error.message : "Không thể tải dashboard.");
      });
    return () => {
      active = false;
    };
  }, [companyId, isRecruiter, onLogout, session.accessToken]);

  if (!dashboard && !error) {
    return (
      <Card padding="lg" className="space-y-4">
        <p className="text-sm text-ink-500 m-0">Đang tải dashboard…</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Card>
    );
  }

  const isCandidate = dashboard?.audience === "CANDIDATE";
  const metrics = dashboard?.metrics ?? {};
  const totalApps = metrics.applications ?? 0;
  const submitted = metrics.submitted ?? 0;
  const underReview = metrics.underReview ?? 0;
  const shortlisted = metrics.shortlisted ?? 0;
  const rejected = metrics.rejected ?? 0;
  const draftJobs = metrics.draftJobs ?? 0;
  const pendingCount = submitted + underReview;
  const conversionRate = pct(shortlisted, totalApps);
  const processedRate = totalApps > 0 ? pct(underReview + shortlisted + rejected, totalApps) : 100;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 px-6 py-6 text-white shadow-card flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-300 m-0">
            {isCandidate ? "Candidate workspace" : "Recruiter ATS"}
          </p>
          <h2 className="text-xl sm:text-2xl font-bold text-white m-0">
            Xin chào, {candidateName || (isCandidate ? "Ứng viên" : "Nhà tuyển dụng")}! 👋
          </h2>
          <p className="text-sm text-slate-300 m-0">
            {isCandidate
              ? "Hồ sơ của bạn được phân tích và đối soát với công việc bằng AI."
              : "Quản lý tin tuyển dụng và đánh giá hồ sơ ứng viên với công nghệ đối soát bằng chứng AI."}
          </p>
        </div>
        {onNavigate && (
          <div className="flex flex-wrap gap-2.5">
            {isCandidate ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => onNavigate("cv")}>
                  <CvIcon size={15} /> Quản lý CV
                </Button>
                <Button variant="primary" size="sm" onClick={() => onNavigate("jobs")}>
                  <JobsIcon size={15} /> Việc làm IT
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" size="sm" onClick={() => onNavigate("jobs")}>
                  <JobsIcon size={15} /> Quản lý tin & Ứng viên
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onNavigate("company")}>
                  <CompanyIcon size={15} /> Công ty & Đội ngũ
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      <Card as="section" padding="lg" aria-labelledby="dashboard-title">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">
              {isRecruiter ? "RECRUITER ATS" : dashboard?.audience ?? "Dashboard"}
            </p>
            <h3 id="dashboard-title" className="text-lg font-bold text-ink-900 m-0 mt-0.5">
              Tổng quan nhanh
            </h3>
          </div>
        </div>

        {dashboard && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(dashboard.metrics).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-border-subtle bg-slate-50/70 px-4 py-3.5 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
              >
                <strong className="block text-2xl font-bold text-ink-900 tabular-nums-kpi">{value}</strong>
                <span className="mt-0.5 block text-xs font-medium text-ink-600">{labels[key] ?? key}</span>
              </div>
            ))}
          </div>
        )}
        {error && <ErrorBanner className="mt-4" tone="error" message={error} />}
      </Card>

      {isCandidate && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Card padding="lg" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Cơ hội việc làm</p>
                  <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5">Việc làm IT gợi ý phù hợp</h3>
                </div>
                {onNavigate && (
                  <Button variant="ghost" size="sm" onClick={() => onNavigate("jobs")}>
                    Xem tất cả việc làm →
                  </Button>
                )}
              </div>

              {recentJobs.length === 0 ? (
                <p className="text-sm text-ink-500 m-0">Chưa có tin tuyển dụng nào đang mở.</p>
              ) : (
                <div className="space-y-3">
                  {recentJobs.map((job) => (
                    <div
                      key={job.jobId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-slate-50/50 p-3.5"
                    >
                      <div className="space-y-1">
                        <strong className="block text-sm font-semibold text-ink-900">{job.title}</strong>
                        <small className="block text-xs text-ink-500">
                          {job.locationText ?? "Linh hoạt"} · {job.workMode ?? "Toàn thời gian"}
                        </small>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {extractSkills(`${job.title} ${job.requirementsText}`)
                            .slice(0, 4)
                            .map((tech) => (
                              <Badge key={tech} tone="neutral">
                                {tech}
                              </Badge>
                            ))}
                        </div>
                      </div>
                      {onNavigate && (
                        <Button variant="secondary" size="sm" onClick={() => onNavigate("jobs")}>
                          Xem & Ứng tuyển
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card padding="md" className="border-brand-200/70 bg-brand-50/40 space-y-2">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shrink-0">
                  <SparklesIcon size={16} />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-ink-900 m-0">Explainable AI Matching Engine</h4>
                  <small className="text-xs text-ink-600">Tính toán điểm số kết hợp trích xuất bằng chứng từ CV</small>
                </div>
              </div>
              <p className="text-xs text-ink-600 m-0 leading-relaxed">
                Khi bạn nộp CV vào một công việc, worker AI sẽ tự động phân tích kinh nghiệm thực tế, đối sánh kỹ năng bắt buộc và trích dẫn số trang PDF làm bằng chứng cho Nhà tuyển dụng.
              </p>
            </Card>
          </div>

          <div className="space-y-6">
            <Card padding="lg" className="space-y-4">
              <h3 className="text-base font-bold text-ink-900 m-0">Trạng thái hồ sơ</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-medium text-ink-700">
                  <span>Mức độ hoàn thiện hồ sơ</span>
                  <strong className="text-brand-700 tabular-nums-kpi">{candidateName ? "85%" : "40%"}</strong>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full bg-brand-600 ${candidateName ? "w-[85%]" : "w-[40%]"}`}
                  />
                </div>
                <ul className="space-y-2 pl-0 list-none m-0 text-xs text-ink-600">
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon size={14} className="text-emerald-600 shrink-0" /> Tài khoản đã xác thực email
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon size={14} className="text-emerald-600 shrink-0" />{" "}
                    {candidateName ? "Đã điền thông tin cơ bản" : "Chưa cập nhật tên hiển thị"}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon size={14} className="text-emerald-600 shrink-0" /> Có CV tải lên để AI phân tích
                  </li>
                </ul>
                {onNavigate && (
                  <Button variant="secondary" size="sm" className="w-full" onClick={() => onNavigate("profile")}>
                    <ProfileIcon size={15} /> Cập nhật hồ sơ
                  </Button>
                )}
              </div>
            </Card>

            <Card padding="lg" className="space-y-3">
              <h3 className="text-base font-bold text-ink-900 m-0">Kỹ năng IT được quan tâm</h3>
              <div className="flex flex-wrap gap-1.5">
                {commonTechs.map((skill) => (
                  <Badge key={skill} tone="neutral">
                    {skill}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {isRecruiter && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Card padding="lg" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Ưu tiên công việc</p>
                  <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5">Cần xử lý ngay</h3>
                </div>
                {pendingCount > 0 ? (
                  <Badge tone="warning">{pendingCount} việc cần xử lý</Badge>
                ) : (
                  <Badge tone="success">Đã xử lý hết</Badge>
                )}
              </div>

              <div className="space-y-3">
                {pendingCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shrink-0">
                        <ProfileIcon size={18} />
                      </span>
                      <div className="space-y-1">
                        <strong className="block text-sm font-bold text-ink-900">
                          {submitted > 0 && underReview > 0
                            ? `${submitted} hồ sơ mới nộp, ${underReview} hồ sơ đang xem xét`
                            : submitted > 0
                              ? `${submitted} hồ sơ mới nộp chờ sơ loại`
                              : `${underReview} hồ sơ đang xem xét`}
                        </strong>
                        <p className="text-xs text-ink-700 m-0 leading-relaxed">
                          {dashboard?.pendingJobTitle
                            ? `Ưu tiên xử lý vị trí: "${dashboard.pendingJobTitle}". Cần đối soát yêu cầu kỹ năng và cập nhật trạng thái tuyển dụng.`
                            : "Ứng viên mới nộp hồ sơ cần được đối soát yêu cầu kỹ năng và cập nhật trạng thái tuyển dụng."}
                        </p>
                      </div>
                    </div>
                    {onNavigate && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const targetJobId = dashboard?.pendingJobId ?? recentJobs[0]?.jobId;
                          if (targetJobId && onOpenJob) {
                            onOpenJob(targetJobId);
                          } else {
                            onNavigate("jobs");
                          }
                        }}
                      >
                        {dashboard?.pendingJobTitle ? "Xử lý vị trí này →" : "Xử lý hồ sơ →"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                        <CheckCircleIcon size={18} />
                      </span>
                      <div className="space-y-1">
                        <strong className="block text-sm font-bold text-ink-900">Không có hồ sơ nào đang chờ sơ loại</strong>
                        <p className="text-xs text-ink-600 m-0">
                          Tất cả ứng viên đã được xử lý. Bạn có thể kiểm tra danh sách JD hoặc tạo vị trí mới.
                        </p>
                      </div>
                    </div>
                    {onNavigate && (
                      <Button variant="secondary" size="sm" onClick={() => onNavigate("jobs")}>
                        Quản lý JD →
                      </Button>
                    )}
                  </div>
                )}

                {draftJobs > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-subtle bg-slate-50/80 p-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
                        <JobsIcon size={18} />
                      </span>
                      <div className="space-y-1">
                        <strong className="block text-sm font-bold text-ink-900">
                          {draftJobs} tin tuyển dụng ở trạng thái bản nháp
                        </strong>
                        <p className="text-xs text-ink-600 m-0">
                          Hoàn thiện tiêu chuẩn yêu cầu để công bố tin tuyển dụng tới cộng đồng ứng viên IT.
                        </p>
                      </div>
                    </div>
                    {onNavigate && (
                      <Button variant="secondary" size="sm" onClick={() => onNavigate("jobs")}>
                        Đăng tin →
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card padding="lg" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Quy trình tuyển dụng</p>
                  <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5">Phễu chuyển đổi ứng viên</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="success">Shortlist {conversionRate}%</Badge>
                  <Badge tone="neutral">{totalApps} hồ sơ</Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { num: 1, name: "Nộp hồ sơ", val: totalApps, rate: totalApps > 0 ? 100 : 0, barClass: "bg-sky-500" },
                  { num: 2, name: "Sơ loại CV", val: underReview, rate: pct(underReview, totalApps), barClass: "bg-amber-500" },
                  { num: 3, name: "Shortlist", val: shortlisted, rate: pct(shortlisted, totalApps), barClass: "bg-emerald-500" },
                  { num: 4, name: "Từ chối", val: rejected, rate: pct(rejected, totalApps), barClass: "bg-slate-400" }
                ].map((step) => (
                  <div key={step.num} className="rounded-xl border border-border-subtle bg-slate-50/70 p-3.5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white border border-border-subtle text-[11px] font-bold text-ink-800">
                        {step.num}
                      </span>
                      <span>{step.name}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <strong className="text-xl font-bold text-ink-900 tabular-nums-kpi">{step.val}</strong>
                      <small className="text-xs font-medium text-ink-500 tabular-nums-kpi">{step.rate}%</small>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full rounded-full ${step.barClass}`} style={{ width: `${step.rate}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-ink-600">
                <span>
                  Đã xử lý: <strong className="text-ink-900 tabular-nums-kpi">{processedRate}%</strong> hồ sơ
                </span>
                <span>
                  Tỷ lệ vào Shortlist:{" "}
                  <strong className="text-emerald-700 tabular-nums-kpi">{conversionRate}%</strong>
                </span>
              </div>
            </Card>

            <Card padding="lg" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Vị trí mở</p>
                  <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5">Vị trí đang mở gần đây</h3>
                </div>
                {onNavigate && (
                  <Button variant="ghost" size="sm" onClick={() => onNavigate("jobs")}>
                    Xem tất cả JD →
                  </Button>
                )}
              </div>

              {recentJobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border-strong bg-slate-50/70 p-6 text-center space-y-3">
                  <p className="text-sm text-ink-500 m-0">Công ty chưa có tin tuyển dụng nào đang mở.</p>
                  {onNavigate && (
                    <Button variant="secondary" size="sm" onClick={() => onNavigate("jobs")}>
                      + Tạo JD mới ngay
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {recentJobs.map((job) => {
                    const statusLabel =
                      job.status === "PUBLISHED" ? "Đang đăng" : job.status === "CLOSED" ? "Đã đóng" : "Bản nháp";
                    const statusTone =
                      job.status === "PUBLISHED" ? "success" : job.status === "CLOSED" ? "neutral" : "warning";
                    return (
                      <div
                        key={job.jobId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-slate-50/50 p-3.5 transition-colors hover:border-brand-200 hover:bg-white"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <strong className="block text-sm font-bold text-ink-900 truncate">{job.title}</strong>
                          <small className="block text-xs text-ink-500">
                            {job.locationText ?? "Linh hoạt"} · {job.workMode ?? "Toàn thời gian"} · {job.openings} chỉ tiêu
                          </small>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone={statusTone}>{statusLabel}</Badge>
                            {extractSkills(`${job.title} ${job.requirementsText}`)
                              .slice(0, 3)
                              .map((tech) => (
                                <Badge key={tech} tone="info">
                                  {tech}
                                </Badge>
                              ))}
                          </div>
                        </div>
                        {onNavigate && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => (onOpenJob ? onOpenJob(job.jobId) : onNavigate("jobs"))}
                          >
                            Xem ứng viên <ArrowRightIcon size={14} />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card padding="md" className="border-brand-200/80 bg-brand-50/40 space-y-2">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shrink-0">
                  <SparklesIcon size={16} />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-ink-900 m-0">AI Matching & Trích Xuất Bằng Chứng</h4>
                  <small className="text-xs text-ink-600">
                    Công nghệ Explainable AI hỗ trợ đối soát kinh nghiệm và kỹ năng minh bạch
                  </small>
                </div>
              </div>
              <p className="text-xs text-ink-600 m-0 leading-relaxed">
                Hệ thống tự động phân tích hồ sơ ứng viên đối sánh với tiêu chuẩn JD, cung cấp điểm số tương đồng và trích dẫn số trang PDF cụ thể làm bằng chứng kiểm chứng.
              </p>
            </Card>
          </div>

          <div className="space-y-6">
            <Card padding="lg" className="space-y-3">
              <h3 className="text-base font-bold text-ink-900 m-0">Phím tắt nhanh</h3>
              <div className="space-y-2">
                {onNavigate && (
                  <>
                    {[
                      {
                        view: "jobs",
                        icon: <JobsIcon size={16} />,
                        title: "Quản lý JD & Ứng viên",
                        desc: "Xem pipeline ứng viên và tạo tin mới"
                      },
                      {
                        view: "company",
                        icon: <CompanyIcon size={16} />,
                        title: "Hồ sơ công ty & Đội ngũ",
                        desc: "Quản lý phân quyền và mời thành viên"
                      },
                      {
                        view: "profile",
                        icon: <ProfileIcon size={16} />,
                        title: "Hồ sơ nhà tuyển dụng",
                        desc: "Cập nhật thông tin liên hệ và chức danh"
                      },
                      {
                        view: "notifications",
                        icon: <NotificationIcon size={16} />,
                        title: "Trung tâm thông báo",
                        desc: "Xem cập nhật hồ sơ mới và phân quyền"
                      },
                      {
                        view: "security",
                        icon: <SecurityIcon size={16} />,
                        title: "Bảo mật tài khoản",
                        desc: "Đổi mật khẩu và quản lý phiên đăng nhập"
                      }
                    ].map((shortcut) => (
                      <button
                        key={shortcut.view}
                        type="button"
                        onClick={() => onNavigate(shortcut.view)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-white p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 cursor-pointer"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700 shrink-0">
                          {shortcut.icon}
                        </span>
                        <div className="min-w-0">
                          <strong className="block text-sm font-semibold text-ink-900">{shortcut.title}</strong>
                          <small className="block text-xs text-ink-500">{shortcut.desc}</small>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </Card>

            <Card padding="lg" className="space-y-3">
              <h3 className="text-base font-bold text-ink-900 m-0">Tiêu chuẩn tuyển dụng hiệu quả</h3>
              <ul className="space-y-2.5 pl-0 list-none m-0 text-xs text-ink-600 leading-relaxed">
                <li className="flex items-start gap-2">
                  <CheckCircleIcon size={14} className="mt-0.5 text-emerald-600 shrink-0" />
                  <span>Điền đầy đủ yêu cầu kỹ năng và số năm kinh nghiệm để đối soát chính xác</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon size={14} className="mt-0.5 text-emerald-600 shrink-0" />
                  <span>Tối ưu mô tả công việc bằng việc xác nhận ParsedJD AI</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon size={14} className="mt-0.5 text-emerald-600 shrink-0" />
                  <span>Phản hồi ứng viên trong 48h để giữ chân nhân tài</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
