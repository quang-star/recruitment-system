import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { CvIcon, JobsIcon, CheckCircleIcon, SparklesIcon } from "../../shared/components/Icon";
import { CvOverview, pendingCvStatuses, reviewCvStatuses } from "./cvStatus";
import { workModeLabel } from "../public/jobPresentation";

type Job = { jobId: string; title: string; locationText: string | null; workMode: string | null };
type Application = { applicationId: string; jobId: string; status: string; appliedAt: string };
type Profile = { displayName: string; headline: string | null; locationText: string | null; avatarUrl?: string | null };
type Props = {
  session: AuthSession;
  profile: Profile | null;
  onNavigate: (view: "profile" | "cv" | "jobs" | "applications" | "notifications") => void;
  onOpenJob: (jobId: string) => void;
};
const applicationLabels: Record<string, string> = {
  SUBMITTED: "Đã gửi hồ sơ", UNDER_REVIEW: "Đang xem xét", SHORTLISTED: "Vào vòng tiếp theo",
  REJECTED: "Chưa phù hợp", WITHDRAWN: "Đã rút hồ sơ"
};

export function CandidateDashboard({ session, profile, onNavigate, onOpenJob }: Props) {
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
    return () => { active = false; };
  }, [session.accessToken, attempt]);

  const ready = cvs?.filter((cv) => cv.activeVersion.processingStatus === "CONFIRMED").length ?? 0;
  const review = cvs?.filter((cv) => reviewCvStatuses.includes(cv.activeVersion.processingStatus)).length ?? 0;
  const processing = cvs?.filter((cv) => pendingCvStatuses.includes(cv.activeVersion.processingStatus)).length ?? 0;
  const profileReady = !!(profile?.displayName?.trim() && profile.headline?.trim() && profile.locationText?.trim());
  const recent = [...(applications ?? [])].sort((a, b) => Date.parse(b.appliedAt) - Date.parse(a.appliedAt)).slice(0, 4);
  const next = cvs === null ? { title: "Chuẩn bị cho cơ hội tiếp theo", text: "Quản lý CV và cập nhật thông tin để nhà tuyển dụng hiểu rõ hơn về bạn.", view: "cv" as const, action: "Quản lý CV" }
    : review ? { title: `${review} CV đang chờ bạn kiểm tra`, text: "Đọc lại thông tin AI đã trích xuất, lưu chỉnh sửa rồi xác nhận trước khi ứng tuyển.", view: "cv" as const, action: "Kiểm tra CV" }
    : ready ? { title: "Bạn đã sẵn sàng ứng tuyển", text: "Khám phá vị trí phù hợp với định hướng của bạn và chọn CV khi gửi hồ sơ.", view: "jobs" as const, action: "Khám phá việc làm" }
    : processing ? { title: "CV của bạn đang được phân tích", text: "Bạn có thể cập nhật hồ sơ trong lúc chờ. Theo dõi kết quả tại CV của tôi.", view: "cv" as const, action: "Theo dõi CV" }
    : { title: "Bắt đầu với CV của bạn", text: "Tải CV dạng PDF để AI trích xuất kỹ năng, kinh nghiệm và học vấn.", view: "cv" as const, action: "Tải CV lên" };

  return <div className="candidate-dashboard">
    <header className="candidate-page-heading">
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {profile?.avatarUrl ? (
          <img src={profile.avatarUrl} alt="Avatar" className="candidate-avatar-preview-img" style={{ width: 52, height: 52 }} onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
        ) : null}
        <div>
          <p className="eyebrow">KHÔNG GIAN ỨNG VIÊN</p>
          <h1>Xin chào, {profile?.displayName || "bạn"}</h1>
          <p>Theo dõi hồ sơ và bước tiếp theo trên hành trình tìm việc.</p>
        </div>
      </div>
      <button type="button" className="secondary-button" onClick={() => onNavigate("profile")}>Cập nhật hồ sơ</button>
    </header>
    {loading ? <div className="workspace-panel" role="status">Đang tải tổng quan của bạn…</div> : <>
      {(cvs === null || jobs === null || applications === null || metrics === null) && <div className="candidate-load-error" role="alert">Một số dữ liệu chưa tải được. <button type="button" className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Thử lại</button></div>}
      <section className="candidate-next-step" aria-labelledby="next-step-title"><div className="next-step-icon"><SparklesIcon size={26} aria-hidden="true" /></div><div><p className="eyebrow">BƯỚC TIẾP THEO</p><h2 id="next-step-title">{next.title}</h2><p>{next.text}</p></div><button type="button" onClick={() => onNavigate(next.view)}>{next.action} →</button></section>
      <div className="candidate-stat-grid">
        {[{ label: "CV sẵn sàng", value: cvs === null ? "—" : ready, view: "cv" as const },
          { label: "Đơn đã gửi", value: metrics?.applications ?? "—", view: "applications" as const },
          { label: "Đang xem xét", value: metrics?.underReview ?? "—", view: "applications" as const },
          { label: "Vào vòng tiếp theo", value: metrics?.shortlisted ?? "—", view: "applications" as const }].map((stat) => <button type="button" key={stat.label} className="candidate-stat" onClick={() => onNavigate(stat.view)}><span>{stat.label}</span><strong>{stat.value}</strong><small>Xem chi tiết →</small></button>)}
      </div>
      <div className="candidate-overview-grid"><div className="candidate-overview-main">
        <section className="workspace-panel"><div className="section-heading"><h2>Ứng tuyển gần đây</h2><button type="button" className="text-button" onClick={() => onNavigate("applications")}>Xem tất cả →</button></div>
          {applications === null ? <p className="muted">Chưa tải được lịch sử ứng tuyển.</p> : recent.length === 0 ? <div className="candidate-empty"><JobsIcon size={28} aria-hidden="true" /><h3>Cơ hội đầu tiên đang chờ bạn</h3><p>Các vị trí bạn ứng tuyển sẽ được theo dõi tại đây.</p><button type="button" className="secondary-button" onClick={() => onNavigate("jobs")}>Tìm việc làm</button></div> : <div className="candidate-recent-list">{recent.map((application) => <article key={application.applicationId}><div><h3>{jobs?.find((job) => job.jobId === application.jobId)?.title ?? "Vị trí đã ứng tuyển"}</h3><small>Đã gửi {new Date(application.appliedAt).toLocaleDateString("vi-VN")}</small></div><span className={`candidate-state ${application.status.toLowerCase()}`}>{applicationLabels[application.status] ?? application.status}</span></article>)}</div>}
        </section>
        <section className="workspace-panel"><div className="section-heading"><h2>Khám phá việc đang tuyển</h2><JobsIcon size={20} aria-hidden="true" /></div><p className="muted">Các cơ hội việc làm đang mở tuyển dụng.</p>
          {jobs === null ? <p className="muted">Chưa tải được danh sách việc làm.</p> : jobs.length === 0 ? <p className="muted">Hiện chưa có vị trí đang tuyển.</p> : jobs.slice(0, 3).map((job) => <button type="button" className="candidate-discovery-job" key={job.jobId} onClick={() => onOpenJob(job.jobId)}><span><strong>{job.title}</strong><small>{job.locationText || "Linh hoạt"} · {workModeLabel(job.workMode)}</small></span><span aria-hidden="true">→</span></button>)}
        </section>
      </div><aside className="candidate-overview-side">
        <section className="workspace-panel"><div className="section-heading"><h2>Chuẩn bị hồ sơ</h2><CvIcon size={20} aria-hidden="true" /></div><p className="muted">Hoàn thành từng bước để bắt đầu ứng tuyển.</p><ul className="candidate-checklist">
          {[{ done: profileReady, title: "Thông tin cá nhân", text: "Tên, nghề nghiệp và địa điểm", view: "profile" as const },
            { done: !!cvs?.length, title: "Tải CV lên", text: cvs === null ? "Chưa tải được trạng thái" : `${cvs.length} CV trong thư viện`, view: "cv" as const },
            { done: ready > 0, title: "Kiểm tra & xác nhận", text: cvs === null ? "Chưa tải được trạng thái" : `${ready} CV sẵn sàng ứng tuyển`, view: "cv" as const }].map((step, index) => <li key={step.title}><span className={step.done ? "checklist-done" : "checklist-number"}>{step.done ? <CheckCircleIcon size={20} aria-hidden="true" /> : index + 1}</span><button type="button" onClick={() => onNavigate(step.view)}><strong>{step.title}</strong><small>{step.text}</small></button></li>)}
        </ul></section>
        <section className="workspace-panel candidate-ai-note"><SparklesIcon size={22} aria-hidden="true" /><h2>Hiểu rõ mức độ phù hợp</h2><p>Sau khi ứng tuyển, kết quả phân tích giúp bạn xem kỹ năng đã đáp ứng và những điểm cần bổ sung, kèm dẫn chứng từ CV.</p><button type="button" className="text-button" onClick={() => onNavigate("applications")}>Theo dõi đơn ứng tuyển →</button></section>
      </aside></div>
    </>}
  </div>;
}
