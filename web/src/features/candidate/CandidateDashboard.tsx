import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { CheckCircleIcon, CvIcon, JobsIcon } from "../../shared/components/Icon";
import { Badge, Button, Card, EmptyState, ErrorBanner } from "../../shared/ui";
import { workModeLabel } from "../public/jobPresentation";
import { CvOverview, pendingCvStatuses, reviewCvStatuses } from "./cvStatus";

type Job = { jobId: string; title: string; locationText: string | null; workMode: string | null };
type Application = {
  applicationId: string;
  jobId: string;
  jobTitle?: string | null;
  companyName?: string | null;
  status: string;
  appliedAt: string;
};
type Profile = { displayName: string; headline: string | null; locationText: string | null; avatarUrl?: string | null };
type Props = {
  session: AuthSession;
  profile: Profile | null;
  onNavigate: (view: "profile" | "cv" | "jobs" | "applications" | "notifications") => void;
  onOpenJob: (jobId: string) => void;
};

const applicationLabels: Record<string, string> = {
  SUBMITTED: "Đã gửi hồ sơ",
  UNDER_REVIEW: "Đang xem xét",
  SHORTLISTED: "Vào vòng tiếp theo",
  INTERVIEW: "Đang phỏng vấn",
  OFFERED: "Đã gửi đề nghị tuyển dụng",
  HIRED: "Đã tuyển dụng",
  REJECTED: "Chưa phù hợp",
  WITHDRAWN: "Đã rút hồ sơ"
};

function applicationTone(status: string): "brand" | "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "SHORTLISTED":
    case "HIRED":
      return "success";
    case "UNDER_REVIEW":
      return "info";
    case "REJECTED":
      return "danger";
    case "WITHDRAWN":
      return "neutral";
    default:
      return "brand";
  }
}

export function CandidateDashboard({ session, profile, onNavigate, onOpenJob }: Props) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [cvs, setCvs] = useState<CvOverview[] | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const options = { accessToken: session.accessToken };
    void Promise.allSettled([
      apiRequest<CvOverview[]>("/api/v2/cvs", options),
      apiRequest<PageResult<Job>>("/api/v2/candidate/jobs?page=0&size=4", options),
      apiRequest<PageResult<Application>>("/api/v2/candidate/applications?page=0&size=4", options),
      apiRequest<{ metrics: Record<string, number> }>("/api/v2/dashboard", options)
    ]).then(([cvResult, jobResult, appResult, statsResult]) => {
      if (!active) return;
      setCvs(cvResult.status === "fulfilled" ? cvResult.value.filter((cv) => cv.status === "ACTIVE") : null);
      setJobs(jobResult.status === "fulfilled" ? jobResult.value.items : null);
      setApplications(appResult.status === "fulfilled" ? appResult.value.items : null);
      setMetrics(statsResult.status === "fulfilled" ? statsResult.value.metrics : null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [session.accessToken, attempt]);

  const ready = cvs?.filter((cv) => cv.activeVersion.processingStatus === "CONFIRMED").length ?? 0;
  const review = cvs?.filter((cv) => reviewCvStatuses.includes(cv.activeVersion.processingStatus)).length ?? 0;
  const processing = cvs?.filter((cv) => pendingCvStatuses.includes(cv.activeVersion.processingStatus)).length ?? 0;
  const profileReady = !!(profile?.displayName?.trim() && profile.headline?.trim() && profile.locationText?.trim());
  const recent = [...(applications ?? [])]
    .sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt))
    .slice(0, 4);

  const next =
    cvs === null
      ? {
          title: "Chuẩn bị cho cơ hội tiếp theo",
          text: "Quản lý CV và cập nhật thông tin để nhà tuyển dụng hiểu rõ hơn về bạn.",
          view: "cv" as const,
          action: "Quản lý CV"
        }
      : review
        ? {
            title: `${review} CV đang chờ bạn kiểm tra`,
            text: "Đọc lại thông tin AI đã trích xuất, lưu chỉnh sửa rồi xác nhận trước khi ứng tuyển.",
            view: "cv" as const,
            action: "Kiểm tra CV"
          }
        : ready
          ? {
              title: "Bạn đã sẵn sàng ứng tuyển",
              text: "Khám phá vị trí phù hợp với định hướng của bạn và chọn CV khi gửi hồ sơ.",
              view: "jobs" as const,
              action: "Khám phá việc làm"
            }
          : processing
            ? {
                title: "CV của bạn đang được phân tích",
                text: "Bạn có thể cập nhật hồ sơ trong lúc chờ. Theo dõi kết quả tại CV của tôi.",
                view: "cv" as const,
                action: "Theo dõi CV"
              }
            : {
                title: "Bắt đầu với CV của bạn",
                text: "Tải CV dạng PDF để AI trích xuất kỹ năng, kinh nghiệm và học vấn.",
                view: "cv" as const,
                action: "Tải CV lên"
              };

  return (
    <div className="space-y-6">
      <Card padding="md" className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {profile?.avatarUrl && failedAvatar !== profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt="Avatar"
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-2xl border border-border-subtle object-cover shrink-0"
              onError={() => setFailedAvatar(profile.avatarUrl ?? null)}
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-base font-bold text-white">
              {(profile?.displayName || "U").trim().slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-700 m-0">
              KHÔNG GIAN ỨNG VIÊN
            </p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900 m-0 truncate">
              Xin chào, {profile?.displayName || "bạn"}
            </h1>
            <p className="text-sm text-ink-500 m-0 mt-0.5">
              Theo dõi hồ sơ và bước tiếp theo trên hành trình tìm việc.
            </p>
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={() => onNavigate("profile")}>
          Cập nhật hồ sơ
        </Button>
      </Card>

      {loading ? (
        <Card padding="lg" role="status">
          <p className="text-sm text-ink-500 m-0 text-center">Đang tải tổng quan của bạn…</p>
        </Card>
      ) : (
        <>
          {(cvs === null || jobs === null || applications === null || metrics === null) && (
            <ErrorBanner
              tone="warning"
              message="Một số dữ liệu chưa tải được."
              action={
                <Button type="button" size="sm" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                  Thử lại
                </Button>
              }
            />
          )}

          <section
            aria-labelledby="next-step-title"
            className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 via-white to-teal-50/70 p-5 sm:p-6 shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-700 m-0">
                  BƯỚC TIẾP THEO
                </p>
                <h2 id="next-step-title" className="text-base sm:text-lg font-bold text-ink-900 m-0 mt-0.5">
                  {next.title}
                </h2>
                <p className="text-sm text-ink-600 m-0 mt-1 leading-relaxed">{next.text}</p>
              </div>
            </div>
            <Button type="button" onClick={() => onNavigate(next.view)} className="shrink-0">
              {next.action} →
            </Button>
          </section>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "CV sẵn sàng", value: cvs === null ? "—" : ready, view: "cv" as const },
              { label: "Đơn đã gửi", value: metrics?.applications ?? "—", view: "applications" as const },
              { label: "Đang xem xét", value: metrics?.underReview ?? "—", view: "applications" as const },
              { label: "Vào vòng tiếp theo", value: metrics?.shortlisted ?? "—", view: "applications" as const }
            ].map((stat) => (
              <button
                type="button"
                key={stat.label}
                onClick={() => onNavigate(stat.view)}
                className="group rounded-2xl border border-border-subtle bg-white p-4 sm:p-5 text-left shadow-card hover:border-brand-300 hover:shadow-card-hover transition-all cursor-pointer flex flex-col gap-1.5"
              >
                <span className="text-xs font-medium text-ink-500">{stat.label}</span>
                <strong className="text-2xl sm:text-3xl font-extrabold text-ink-900 tabular-nums-kpi">
                  {stat.value}
                </strong>
                <small className="text-xs font-semibold text-brand-700 group-hover:translate-x-0.5 transition-transform">
                  Xem chi tiết →
                </small>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              <Card as="section" padding="md" className="space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-border-subtle">
                  <h2 className="text-base font-bold text-ink-900 m-0">Ứng tuyển gần đây</h2>
                  <button
                    type="button"
                    onClick={() => onNavigate("applications")}
                    className="text-xs font-semibold text-brand-700 hover:text-brand-800 bg-transparent border-0 p-0 cursor-pointer"
                  >
                    Xem tất cả →
                  </button>
                </div>

                {applications === null ? (
                  <p className="text-sm text-ink-500 m-0">Chưa tải được lịch sử ứng tuyển.</p>
                ) : recent.length === 0 ? (
                  <EmptyState
                    icon={<JobsIcon size={24} />}
                    title="Cơ hội đầu tiên đang chờ bạn"
                    description="Các vị trí bạn ứng tuyển sẽ được theo dõi tại đây."
                    action={
                      <Button type="button" variant="secondary" size="sm" onClick={() => onNavigate("jobs")}>
                        Tìm việc làm
                      </Button>
                    }
                  />
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {recent.map((application) => (
                      <article
                        key={application.applicationId}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-ink-900 m-0 truncate">
                            {application.jobTitle || jobs?.find((job) => job.jobId === application.jobId)?.title || "Vị trí đã ứng tuyển"}
                          </h3>
                          <small className="text-xs text-ink-500">
                            {application.companyName ? `${application.companyName} · ` : ""}Đã gửi {new Date(application.appliedAt).toLocaleDateString("vi-VN")}
                          </small>
                        </div>
                        <Badge tone={applicationTone(application.status)}>
                          {applicationLabels[application.status] ?? application.status}
                        </Badge>
                      </article>
                    ))}
                  </div>
                )}
              </Card>

              <Card as="section" padding="md" className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-ink-900 m-0">Khám phá việc đang tuyển</h2>
                    <p className="text-xs text-ink-500 m-0 mt-0.5">Các cơ hội việc làm đang mở tuyển dụng.</p>
                  </div>
                  <JobsIcon size={18} className="text-ink-400" aria-hidden="true" />
                </div>

                {jobs === null ? (
                  <p className="text-sm text-ink-500 m-0">Chưa tải được danh sách việc làm.</p>
                ) : jobs.length === 0 ? (
                  <p className="text-sm text-ink-500 m-0">Hiện chưa có vị trí đang tuyển.</p>
                ) : (
                  <div className="space-y-2">
                    {jobs.slice(0, 3).map((job) => (
                      <button
                        type="button"
                        key={job.jobId}
                        onClick={() => onOpenJob(job.jobId)}
                        className="w-full flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-slate-50/70 px-4 py-3 text-left hover:border-brand-300 hover:bg-white transition-colors cursor-pointer"
                      >
                        <span className="min-w-0">
                          <strong className="block text-sm font-semibold text-ink-900 truncate">{job.title}</strong>
                          <small className="block text-xs text-ink-500 mt-0.5">
                            {job.locationText || "Linh hoạt"} · {workModeLabel(job.workMode)}
                          </small>
                        </span>
                        <span aria-hidden="true" className="text-brand-700 font-semibold">
                          →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <Card as="section" padding="md" className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-ink-900 m-0">Chuẩn bị hồ sơ</h2>
                    <p className="text-xs text-ink-500 m-0 mt-0.5">Hoàn thành từng bước để bắt đầu ứng tuyển.</p>
                  </div>
                  <CvIcon size={18} className="text-ink-400" aria-hidden="true" />
                </div>

                <ul className="space-y-2.5 list-none p-0 m-0">
                  {[
                    {
                      done: profileReady,
                      title: "Thông tin cá nhân",
                      text: "Tên, nghề nghiệp và địa điểm",
                      view: "profile" as const
                    },
                    {
                      done: !!cvs?.length,
                      title: "Tải CV lên",
                      text: cvs === null ? "Chưa tải được trạng thái" : `${cvs.length} CV trong thư viện`,
                      view: "cv" as const
                    },
                    {
                      done: ready > 0,
                      title: "Kiểm tra & xác nhận",
                      text: cvs === null ? "Chưa tải được trạng thái" : `${ready} CV sẵn sàng ứng tuyển`,
                      view: "cv" as const
                    }
                  ].map((step, index) => (
                    <li key={step.title} className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          step.done
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-ink-600"
                        }`}
                      >
                        {step.done ? <CheckCircleIcon size={16} aria-hidden="true" /> : index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate(step.view)}
                        className="flex-1 min-w-0 text-left rounded-xl border border-transparent hover:border-border-subtle hover:bg-slate-50 px-2.5 py-2 transition-colors bg-transparent cursor-pointer"
                      >
                        <strong className="block text-sm font-semibold text-ink-900">{step.title}</strong>
                        <small className="block text-xs text-ink-500">{step.text}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card as="section" padding="md" className="space-y-2.5 bg-slate-50/70">
                <div className="flex items-center gap-2 text-brand-700">
                  <h2 className="text-sm font-bold text-ink-900 m-0">Hiểu rõ mức độ phù hợp</h2>
                </div>
                <p className="text-xs sm:text-sm text-ink-600 m-0 leading-relaxed">
                  Sau khi ứng tuyển, kết quả phân tích giúp bạn xem kỹ năng đã đáp ứng và những điểm cần bổ sung, kèm dẫn chứng từ CV.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate("applications")}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 bg-transparent border-0 p-0 cursor-pointer"
                >
                  Theo dõi đơn ứng tuyển →
                </button>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
