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
  SecurityIcon
} from "../../shared/components/Icon";
import { Badge, Button, Card, ErrorBanner, Skeleton } from "../../shared/ui";
import { workModeLabel } from "../public/jobPresentation";

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
  onEditJob?: (jobId: string) => void;
};

const labels: Record<string, string> = {
  cvs: "CV",
  applications: "Hồ sơ ứng tuyển",
  submitted: "Mới nộp",
  underReview: "Đang xem xét",
  shortlisted: "Shortlist",
  interview: "Phỏng vấn",
  offered: "Đề nghị tuyển",
  hired: "Đã tuyển dụng",
  rejected: "Đã từ chối",
  withdrawn: "Đã rút",
  reachedShortlisted: "Vào Shortlist+",
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

export function DashboardPanel({ session, companyId, onLogout, onNavigate, onOpenJob, onEditJob, candidateName }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [daysRange, setDaysRange] = useState<30 | null>(30);

  const isRecruiter = session.roles.includes("RECRUITER");

  useEffect(() => {
    let active = true;
    if (isRecruiter && !companyId) {
      setDashboard(null);
      return () => {
        active = false;
      };
    }
    const params = new URLSearchParams();
    if (companyId) params.set("companyId", companyId);
    if (isRecruiter && daysRange) params.set("days", String(daysRange));
    const qs = params.toString();
    const path = qs ? `/api/v2/dashboard?${qs}` : "/api/v2/dashboard";

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
          apiRequest<PageResult<Job>>(`/api/v2/companies/${companyId}/jobs?status=PUBLISHED&page=0&size=4`, {
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
  }, [companyId, daysRange, isRecruiter, onLogout, session.accessToken]);

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
  const interview = metrics.interview ?? 0;
  const offered = metrics.offered ?? 0;
  const hired = metrics.hired ?? 0;
  const rejected = metrics.rejected ?? 0;
  const withdrawn = metrics.withdrawn ?? 0;
  const reachedShortlisted = metrics.reachedShortlisted ?? shortlisted + interview + offered + hired;
  const draftJobs = metrics.draftJobs ?? 0;
  const pendingCount = submitted + underReview;
  const conversionRate = pct(reachedShortlisted, totalApps);
  const processedRate = totalApps > 0 ? pct(totalApps - submitted, totalApps) : 100;

  return (
    <div className="space-y-6">
      {isCandidate && (
        <section className="rounded-lg border border-border-subtle bg-white px-6 py-5 shadow-card flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-xl sm:text-2xl font-bold text-ink-900 m-0">
              Xin chào, {candidateName || "Ứng viên"}
            </h2>
            <p className="text-sm text-ink-600 m-0">
              Quản lý CV và đối chiếu yêu cầu công việc trước khi ứng tuyển.
            </p>
          </div>
          {onNavigate && (
            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" size="sm" onClick={() => onNavigate("cv")}>
                <CvIcon size={15} /> Quản lý CV
              </Button>
              <Button variant="primary" size="sm" onClick={() => onNavigate("jobs")}>
                <JobsIcon size={15} /> Tìm việc làm
              </Button>
            </div>
          )}
        </section>
      )}

      {isCandidate && (
        <Card as="section" padding="lg" aria-labelledby="dashboard-title">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 m-0">
                {dashboard?.audience ?? "Dashboard"}
              </p>
              <h3 id="dashboard-title" className="text-lg font-bold text-ink-900 m-0 mt-0.5">
                Tổng quan nhanh
              </h3>
            </div>
          </div>

          {dashboard && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {Object.entries(dashboard.metrics)
                .filter(([key]) => key !== "reachedShortlisted")
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-border-subtle bg-slate-50/70 px-4 py-3.5 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
                  >
                    <strong className="block text-2xl font-bold text-ink-900 tabular-nums-kpi">{value}</strong>
                    <span className="mt-0.5 block text-xs sm:text-sm font-medium text-ink-600">{labels[key] ?? key}</span>
                  </div>
                ))}
            </div>
          )}
          {error && <ErrorBanner className="mt-4" tone="error" message={error} />}
        </Card>
      )}

      {isRecruiter && (
        <section className="space-y-4">
          {error && <ErrorBanner tone="error" message={error} />}
          {dashboard && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "Tin đang đăng", value: metrics.publishedJobs ?? 0, note: `Trên tổng ${metrics.jobs ?? 0} tin` },
                { label: "Bản nháp", value: metrics.draftJobs ?? 0, note: "Chờ hoàn thiện / xác nhận JD" },
                { label: "Mới nộp (SUBMITTED)", value: submitted, note: "Đang chờ sơ loại" },
                { label: "Đang xem xét", value: underReview, note: "Đang trong quy trình lọc" }
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-lg border border-border-subtle bg-white p-4">
                  <span className="block text-xs font-medium text-ink-500">{kpi.label}</span>
                  <strong className="mt-1.5 block text-2xl font-semibold text-ink-900 tabular-nums-kpi">{kpi.value}</strong>
                  <span className="mt-1 block text-xs text-ink-500">{kpi.note}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isCandidate && (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Card padding="lg" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 m-0">Cơ hội việc làm</p>
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
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-slate-50/50 p-3.5"
                    >
                      <div className="space-y-1">
                        <strong className="block text-sm font-semibold text-ink-900">{job.title}</strong>
                        <small className="block text-xs text-ink-500">
                          {job.locationText ?? "Linh hoạt"} · {workModeLabel(job.workMode)}
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
              <div className="flex items-start gap-2.5">
                <CvIcon size={17} className="text-brand-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-bold text-ink-900 m-0">Đối chiếu CV kèm trích dẫn nguồn</h4>
                  <small className="text-xs text-ink-600">Hỗ trợ xem kỹ năng phù hợp và bằng chứng từ CV cho vị trí IT</small>
                </div>
              </div>
              <p className="text-sm text-ink-600 m-0 leading-relaxed">
                Khi bạn nộp CV vào vị trí CNTT, hệ thống phân tích kỹ năng, kinh nghiệm và trích dẫn vị trí trong tệp PDF để hỗ trợ nhà tuyển dụng xem xét hồ sơ.
              </p>
            </Card>
          </div>

          <div className="space-y-6">
            <Card padding="lg" className="space-y-4">
              <h3 className="text-base font-bold text-ink-900 m-0">Trạng thái hồ sơ</h3>
              <div className="space-y-3">
                <ul className="space-y-2 pl-0 list-none m-0 text-sm text-ink-600">
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon size={14} className={candidateName ? "text-emerald-600 shrink-0" : "text-ink-400 shrink-0"} />{" "}
                    {candidateName ? "Đã cập nhật tên hiển thị" : "Chưa cập nhật tên hiển thị"}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon size={14} className={(metrics.cvs ?? 0) > 0 ? "text-emerald-600 shrink-0" : "text-ink-400 shrink-0"} />{" "}
                    {(metrics.cvs ?? 0) > 0 ? `Đã có ${metrics.cvs} CV trong thư viện` : "Chưa tải lên CV nào"}
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircleIcon size={14} className={totalApps > 0 ? "text-emerald-600 shrink-0" : "text-ink-400 shrink-0"} />{" "}
                    {totalApps > 0 ? `Đã gửi ${totalApps} hồ sơ ứng tuyển` : "Chưa gửi hồ sơ ứng tuyển nào"}
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
              <h3 className="text-base font-bold text-ink-900 m-0">Kỹ năng phổ biến</h3>
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
        <div className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-2 items-start">
            <Card padding="lg" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink-900 m-0">Cần xử lý ngay</h3>
                  <p className="text-xs text-ink-500 m-0 mt-0.5">Theo dữ liệu hiện tại</p>
                </div>
                {pendingCount > 0 ? (
                  <Badge tone="warning">{pendingCount} việc cần xử lý</Badge>
                ) : (
                  <Badge tone="success">Đã xử lý hết</Badge>
                )}
              </div>

              <div className="space-y-3">
                {pendingCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <ProfileIcon size={18} className="text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="space-y-1">
                        <strong className="block text-sm font-semibold text-ink-900">
                          {submitted > 0 && underReview > 0
                            ? `${submitted} hồ sơ mới nộp, ${underReview} hồ sơ đang xem xét`
                            : submitted > 0
                              ? `${submitted} hồ sơ mới nộp chờ sơ loại`
                              : `${underReview} hồ sơ đang xem xét`}
                        </strong>
                        <p className="text-xs text-ink-700 m-0 leading-relaxed">
                          {dashboard?.pendingJobTitle
                            ? `Ưu tiên xử lý vị trí: "${dashboard.pendingJobTitle}".`
                            : "Ứng viên mới nộp hồ sơ cần được đối soát và cập nhật trạng thái."}
                        </p>
                      </div>
                    </div>
                    {onNavigate && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const targetJobId = dashboard?.pendingJobId ?? recentJobs[0]?.jobId;
                          if (targetJobId && onOpenJob) {
                            onOpenJob(targetJobId);
                          } else {
                            onNavigate("candidates");
                          }
                        }}
                      >
                        {dashboard?.pendingJobTitle ? "Xử lý vị trí này →" : "Xử lý hồ sơ →"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <CheckCircleIcon size={18} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="space-y-1">
                        <strong className="block text-sm font-semibold text-ink-900">Không có hồ sơ nào đang chờ sơ loại</strong>
                        <p className="text-xs text-ink-600 m-0">
                          Tất cả ứng viên đã được xử lý.
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
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border-subtle bg-slate-50/70 p-4">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <JobsIcon size={18} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="space-y-1">
                        <strong className="block text-sm font-semibold text-ink-900">
                          {draftJobs} tin tuyển dụng ở trạng thái bản nháp
                        </strong>
                        <p className="text-xs text-ink-600 m-0">
                          Hoàn thiện nội dung để công bố tin tuyển dụng tới ứng viên.
                        </p>
                      </div>
                    </div>
                    {onNavigate && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const draftJob = recentJobs.find((job) => job.status === "DRAFT");
                          if (draftJobs === 1 && draftJob && onEditJob) {
                            onEditJob(draftJob.jobId);
                          } else {
                            onNavigate("jobs?status=DRAFT");
                          }
                        }}
                      >
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
                  <h3 className="text-sm font-semibold text-ink-900 m-0">Phân bố trạng thái hồ sơ</h3>
                  <p className="text-xs text-ink-500 m-0 mt-0.5">
                    {daysRange ? `Trong ${daysRange} ngày gần nhất` : "Toàn bộ thời gian"} · Tổng {totalApps} hồ sơ · Đạt Shortlist+: {reachedShortlisted}/{totalApps} ({conversionRate}%)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-border-subtle bg-slate-50 p-0.5 text-xs font-medium">
                    <button
                      type="button"
                      className={`rounded-md px-2 py-0.5 cursor-pointer ${daysRange === 30 ? "bg-white text-ink-900 shadow-xs font-semibold" : "text-ink-600"}`}
                      onClick={() => setDaysRange(30)}
                    >
                      30 ngày
                    </button>
                    <button
                      type="button"
                      className={`rounded-md px-2 py-0.5 cursor-pointer ${daysRange === null ? "bg-white text-ink-900 shadow-xs font-semibold" : "text-ink-600"}`}
                      onClick={() => setDaysRange(null)}
                    >
                      Tất cả
                    </button>
                  </div>
                  <Badge tone="success">Shortlist {conversionRate}%</Badge>
                  <Badge tone="neutral">{processedRate}% đã xử lý</Badge>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  { num: 1, name: "Mới nộp", val: submitted, rate: pct(submitted, totalApps) },
                  { num: 2, name: "Đang xem xét", val: underReview, rate: pct(underReview, totalApps) },
                  { num: 3, name: "Shortlist", val: shortlisted, rate: pct(shortlisted, totalApps) },
                  { num: 4, name: "Phỏng vấn", val: interview, rate: pct(interview, totalApps) },
                  { num: 5, name: "Đề nghị tuyển", val: offered, rate: pct(offered, totalApps) },
                  { num: 6, name: "Đã tuyển dụng", val: hired, rate: pct(hired, totalApps) },
                  { num: 7, name: "Đã từ chối", val: rejected, rate: pct(rejected, totalApps) },
                  { num: 8, name: "Đã rút", val: withdrawn, rate: pct(withdrawn, totalApps) }
                ].map((step) => (
                  <div key={step.num} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-700">{step.name}</span>
                      <span className="tabular-nums-kpi text-ink-500">
                        {step.val} ({step.rate}%)
                      </span>
                    </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${step.val > 0 ? Math.max(step.rate, 3) : 0}%` }} />
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
          </div>

          <Card padding="lg" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-ink-900 m-0">Tin tuyển dụng gần đây</h3>
                <span className="inline-flex items-center gap-1 rounded-md border border-border-subtle bg-slate-50 px-2 py-0.5 text-xs text-ink-600">
                  <span>Đã đóng</span>
                  <strong className="tabular-nums-kpi text-ink-900">{metrics.closedJobs ?? 0}</strong>
                </span>
              </div>
              {onNavigate && (
                <Button variant="ghost" size="sm" onClick={() => onNavigate("jobs")}>
                  Xem tất cả JD →
                </Button>
              )}
            </div>

            {recentJobs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-strong bg-slate-50/70 p-6 text-center space-y-3">
                <p className="text-sm text-ink-500 m-0">Công ty chưa có tin tuyển dụng nào đang mở.</p>
                {onNavigate && (
                  <Button variant="secondary" size="sm" onClick={() => onNavigate("jobs")}>
                    + Tạo JD mới ngay
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {recentJobs.map((job) => {
                  const statusLabel =
                    job.status === "PUBLISHED" ? "Đang đăng" : job.status === "CLOSED" ? "Đã đóng" : "Bản nháp";
                  const statusTone =
                    job.status === "PUBLISHED" ? "success" : job.status === "CLOSED" ? "neutral" : "warning";
                  return (
                    <div
                      key={job.jobId}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/70"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <strong className="block text-sm font-semibold text-ink-900 truncate">{job.title}</strong>
                        <small className="block text-xs text-ink-500">
                          {job.locationText ?? "Linh hoạt"} · {workModeLabel(job.workMode)} · {job.openings} chỉ tiêu
                        </small>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <Badge tone={statusTone}>{statusLabel}</Badge>
                        {onNavigate && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => (onOpenJob ? onOpenJob(job.jobId) : onNavigate("candidates"))}
                          >
                            Xem ứng viên <ArrowRightIcon size={14} />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
