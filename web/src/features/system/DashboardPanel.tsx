import { useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import {
  CvIcon,
  JobsIcon,
  ProfileIcon,
  SparklesIcon,
  CheckCircleIcon,
  CompanyIcon,
  NotificationIcon,
  SecurityIcon
} from "../../shared/components/Icon";

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

export function DashboardPanel({ session, companyId, onLogout, onNavigate, onOpenJob, candidateName }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isRecruiter = session.roles.includes("RECRUITER");

  useEffect(() => {
    let active = true;
    if (isRecruiter && !companyId) {
      setDashboard(null);
      return () => { active = false; };
    }
    const path = companyId ? `/api/v2/dashboard?companyId=${companyId}` : "/api/v2/dashboard";

    void apiRequest<Dashboard>(path, { accessToken: session.accessToken })
      .then((result) => {
        if (!active) return;
        setDashboard(result);
        if (result.audience === "CANDIDATE") {
          apiRequest<PageResult<Job>>("/api/v2/candidate/jobs?page=0&size=3", { accessToken: session.accessToken })
            .then((jobs) => { if (active) setRecentJobs(jobs.items); })
            .catch(() => {});
        } else if (result.audience === "RECRUITER" && companyId) {
          apiRequest<PageResult<Job>>(`/api/v2/companies/${companyId}/jobs?page=0&size=4`, { accessToken: session.accessToken })
            .then((jobs) => { if (active) setRecentJobs(jobs.items); })
            .catch(() => {});
        }
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
        else setError(requestError instanceof ApiClientError ? requestError.error.message : "Không thể tải dashboard.");
      });
    return () => { active = false; };
  }, [companyId, isRecruiter, onLogout, session.accessToken]);

  if (!dashboard && !error) return <section className="workspace-panel"><p className="muted">Đang tải dashboard…</p></section>;

  const isCandidate = dashboard?.audience === "CANDIDATE";
  const metrics = dashboard?.metrics ?? {};
  const totalApps = metrics.applications ?? 0;
  const submitted = metrics.submitted ?? 0;
  const underReview = metrics.underReview ?? 0;
  const shortlisted = metrics.shortlisted ?? 0;
  const rejected = metrics.rejected ?? 0;
  const draftJobs = metrics.draftJobs ?? 0;
  const pendingCount = submitted + underReview;
  const conversionRate = totalApps > 0 ? Math.round((shortlisted / totalApps) * 100) : 0;

  return (
    <div className="dashboard-container">
      {/* --- BANNER --- */}
      {isCandidate ? (
        <section className="dashboard-welcome-banner">
          <div className="welcome-text">
            <h2>Xin chào, {candidateName || "Ứng viên"}! 👋</h2>
            <p>Hồ sơ của bạn được phân tích và đối soát với công việc bằng AI.</p>
          </div>
          {onNavigate && (
            <div className="welcome-quick-actions">
              <button type="button" className="secondary-button" onClick={() => onNavigate("cv")}>
                <CvIcon size={16} /> Quản lý CV
              </button>
              <button type="button" onClick={() => onNavigate("jobs")}>
                <JobsIcon size={16} /> Việc làm IT
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="dashboard-welcome-banner recruiter-banner">
          <div className="welcome-text">
            <h2>Xin chào, {candidateName || "Nhà tuyển dụng"}! 👋</h2>
            <p>Quản lý tin tuyển dụng và đánh giá hồ sơ ứng viên với công nghệ đối soát bằng chứng AI.</p>
          </div>
          {onNavigate && (
            <div className="welcome-quick-actions">
              <button type="button" onClick={() => onNavigate("jobs")}>
                <JobsIcon size={16} /> Quản lý tin & Ứng viên
              </button>
              <button type="button" className="secondary-button" onClick={() => onNavigate("company")}>
                <CompanyIcon size={16} /> Công ty & Đội ngũ
              </button>
            </div>
          )}
        </section>
      )}

      {/* --- QUICK METRICS --- */}
      <section className="workspace-panel dashboard-panel" aria-labelledby="dashboard-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{isRecruiter ? "RECRUITER ATS" : (dashboard?.audience ?? "Dashboard")}</p>
            <h3 id="dashboard-title">Tổng quan nhanh</h3>
          </div>
        </div>

        {dashboard && (
          <div className="metric-grid">
            {Object.entries(dashboard.metrics).map(([key, value]) => (
              <div className="metric-card" key={key}>
                <strong>{value}</strong>
                <span>{labels[key] ?? key}</span>
              </div>
            ))}
          </div>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>

      {/* --- CANDIDATE 2-COLUMN VIEW --- */}
      {isCandidate && (
        <div className="dashboard-two-col-grid">
          <div className="dashboard-main-col">
            <section className="workspace-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Cơ hội việc làm</p>
                  <h3>Việc làm IT gợi ý phù hợp</h3>
                </div>
                {onNavigate && (
                  <button type="button" className="text-button" onClick={() => onNavigate("jobs")}>
                    Xem tất cả việc làm →
                  </button>
                )}
              </div>

              {recentJobs.length === 0 ? (
                <p className="muted">Chưa có tin tuyển dụng nào đang mở.</p>
              ) : (
                <div className="dashboard-job-list">
                  {recentJobs.map((job) => (
                    <div key={job.jobId} className="dashboard-job-card">
                      <div className="job-info">
                        <strong>{job.title}</strong>
                        <small>{job.locationText ?? "Linh hoạt"} · {job.workMode ?? "Toàn thời gian"}</small>
                        <div className="job-tags">
                          {extractSkills(`${job.title} ${job.requirementsText}`).slice(0, 4).map((tech) => (
                            <span key={tech} className="tech-badge">{tech}</span>
                          ))}
                        </div>
                      </div>
                      {onNavigate && (
                        <button type="button" className="secondary-button compact-btn" onClick={() => onNavigate("jobs")}>
                          Xem & Ứng tuyển
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="workspace-panel ai-insight-card">
              <div className="ai-insight-header">
                <span className="brand-mark"><SparklesIcon size={16} /></span>
                <div>
                  <h4>Explainable AI Matching Engine</h4>
                  <small>Tính toán điểm số theo Baseline-v4 kết hợp trích xuất bằng chứng</small>
                </div>
              </div>
              <p className="muted">
                Khi bạn nộp CV vào một công việc, worker AI sẽ tự động phân tích kinh nghiệm thực tế, đối sánh kỹ năng bắt buộc và trích dẫn số trang PDF làm bằng chứng cho Nhà tuyển dụng.
              </p>
            </section>
          </div>

          <div className="dashboard-side-col">
            <section className="workspace-panel">
              <div className="section-heading">
                <h3>Trạng thái hồ sơ</h3>
              </div>
              <div className="profile-status-block">
                <div className="status-progress-info">
                  <span>Mức độ hoàn thiện hồ sơ</span>
                  <strong>{candidateName ? "85%" : "40%"}</strong>
                </div>
                <progress max={100} value={candidateName ? 85 : 40} />
                <ul className="profile-tips-list">
                  <li><CheckCircleIcon size={14} /> Tài khoản đã xác thực email</li>
                  <li><CheckCircleIcon size={14} /> {candidateName ? "Đã điền thông tin cơ bản" : "Chưa cập nhật tên hiển thị"}</li>
                  <li><CheckCircleIcon size={14} /> Có CV tải lên để AI phân tích</li>
                </ul>
                {onNavigate && (
                  <button type="button" className="secondary-button full-width" onClick={() => onNavigate("profile")}>
                    <ProfileIcon size={15} /> Cập nhật hồ sơ
                  </button>
                )}
              </div>
            </section>

            <section className="workspace-panel">
              <div className="section-heading">
                <h3>Kỹ năng IT được quan tâm</h3>
              </div>
              <div className="market-skills-wrap">
                {commonTechs.map((skill) => (
                  <span key={skill} className="market-skill-tag">{skill}</span>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* --- RECRUITER 2-COLUMN VIEW --- */}
      {isRecruiter && (
        <div className="dashboard-two-col-grid">
          <div className="dashboard-main-col">
            {/* Action Center - Cần xử lý ngay */}
            <section className="workspace-panel action-center-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Ưu tiên công việc</p>
                  <h3>Cần xử lý ngay</h3>
                </div>
                {pendingCount > 0 ? (
                  <span className="status-pill status-pill-urgent">
                    {pendingCount} việc cần xử lý
                  </span>
                ) : (
                  <span className="status-pill status-pill-calm">
                    Đã xử lý hết
                  </span>
                )}
              </div>

              <div className="action-center-items">
                {pendingCount > 0 ? (
                  <div className="action-item urgency-high">
                    <div className="action-item-icon">
                      <ProfileIcon size={18} />
                    </div>
                    <div className="action-item-body">
                      <strong>
                        {submitted > 0 && underReview > 0
                          ? `${submitted} hồ sơ mới nộp, ${underReview} hồ sơ đang xem xét`
                          : submitted > 0
                          ? `${submitted} hồ sơ mới nộp chờ sơ loại`
                          : `${underReview} hồ sơ đang xem xét`}
                      </strong>
                      <p>
                        {dashboard?.pendingJobTitle
                          ? `Ưu tiên xử lý vị trí: "${dashboard.pendingJobTitle}". Cần đối soát yêu cầu kỹ năng và cập nhật trạng thái tuyển dụng.`
                          : "Ứng viên mới nộp hồ sơ cần được đối soát yêu cầu kỹ năng và cập nhật trạng thái tuyển dụng."}
                      </p>
                    </div>
                    {onNavigate && (
                      <button
                        type="button"
                        className="action-item-btn"
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
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="action-item urgency-none">
                    <div className="action-item-icon calm-icon">
                      <CheckCircleIcon size={18} />
                    </div>
                    <div className="action-item-body">
                      <strong>Không có hồ sơ nào đang chờ sơ loại</strong>
                      <p>Tất cả ứng viên đã được xử lý. Bạn có thể kiểm tra danh sách JD hoặc tạo vị trí mới.</p>
                    </div>
                    {onNavigate && (
                      <button
                        type="button"
                        className="secondary-button compact-btn"
                        onClick={() => onNavigate("jobs")}
                      >
                        Quản lý JD →
                      </button>
                    )}
                  </div>
                )}

                {draftJobs > 0 && (
                  <div className="action-item urgency-medium">
                    <div className="action-item-icon warning-icon">
                      <JobsIcon size={18} />
                    </div>
                    <div className="action-item-body">
                      <strong>
                        {draftJobs} tin tuyển dụng ở trạng thái bản nháp
                      </strong>
                      <p>Hoàn thiện tiêu chuẩn yêu cầu để công bố tin tuyển dụng tới cộng đồng ứng viên IT.</p>
                    </div>
                    {onNavigate && (
                      <button
                        type="button"
                        className="secondary-button compact-btn"
                        onClick={() => onNavigate("jobs")}
                      >
                        Đăng tin →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Recruitment Pipeline Funnel Visualizer */}
            <section className="workspace-panel funnel-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Quy trình tuyển dụng</p>
                  <h3>Phễu chuyển đổi ứng viên</h3>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="status-pill success">Shortlist {conversionRate}%</span>
                  <span className="status-pill">{totalApps} hồ sơ</span>
                </div>
              </div>
              <div className="recruiter-funnel-steps">
                <div className="funnel-step">
                  <div className="funnel-step-head">
                    <span className="step-num">1</span>
                    <span className="step-name">Nộp hồ sơ</span>
                  </div>
                  <strong className="step-val">{totalApps}</strong>
                  <div className="step-bar-wrap">
                    <div className="step-bar" style={{ width: "100%", background: "#3b82f6" }}></div>
                  </div>
                  <small className="step-rate">100%</small>
                </div>

                <div className="funnel-arrow">➔</div>

                <div className="funnel-step">
                  <div className="funnel-step-head">
                    <span className="step-num">2</span>
                    <span className="step-name">Sơ loại CV</span>
                  </div>
                  <strong className="step-val">{underReview}</strong>
                  <div className="step-bar-wrap">
                    <div className="step-bar" style={{
                      width: totalApps > 0 ? `${Math.round((underReview / totalApps) * 100)}%` : "0%",
                      background: "#f59e0b"
                    }}></div>
                  </div>
                  <small className="step-rate">
                    {totalApps > 0 ? `${Math.round((underReview / totalApps) * 100)}%` : "0%"}
                  </small>
                </div>

                <div className="funnel-arrow">➔</div>

                <div className="funnel-step">
                  <div className="funnel-step-head">
                    <span className="step-num">3</span>
                    <span className="step-name">Shortlist</span>
                  </div>
                  <strong className="step-val">{shortlisted}</strong>
                  <div className="step-bar-wrap">
                    <div className="step-bar" style={{
                      width: totalApps > 0 ? `${Math.round((shortlisted / totalApps) * 100)}%` : "0%",
                      background: "#10b981"
                    }}></div>
                  </div>
                  <small className="step-rate">
                    {totalApps > 0 ? `${Math.round((shortlisted / totalApps) * 100)}%` : "0%"}
                  </small>
                </div>

                <div className="funnel-arrow">➔</div>

                <div className="funnel-step">
                  <div className="funnel-step-head">
                    <span className="step-num">4</span>
                    <span className="step-name">Từ chối</span>
                  </div>
                  <strong className="step-val">{rejected}</strong>
                  <div className="step-bar-wrap">
                    <div className="step-bar" style={{
                      width: totalApps > 0 ? `${Math.round((rejected / totalApps) * 100)}%` : "0%",
                      background: "#94a3b8"
                    }}></div>
                  </div>
                  <small className="step-rate">
                    {totalApps > 0 ? `${Math.round((rejected / totalApps) * 100)}%` : "0%"}
                  </small>
                </div>
              </div>

              <div className="funnel-insights-bar" style={{ display: "flex", justifyContent: "space-between", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #f1f5f9", fontSize: "0.82rem", color: "#64748b" }}>
                <span>Đã xử lý: <strong>{totalApps > 0 ? Math.round(((underReview + shortlisted + rejected) / totalApps) * 100) : 100}%</strong> hồ sơ</span>
                <span>Tỷ lệ vào Shortlist: <strong style={{ color: "#10b981" }}>{conversionRate}%</strong></span>
              </div>
            </section>

            {/* Recent Company Jobs List */}
            <section className="workspace-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Vị trí mở</p>
                  <h3>Vị trí đang mở gần đây</h3>
                </div>
                {onNavigate && (
                  <button type="button" className="text-button" onClick={() => onNavigate("jobs")}>
                    Xem tất cả JD →
                  </button>
                )}
              </div>

              {recentJobs.length === 0 ? (
                <div className="empty-inline-state">
                  <p className="muted">Công ty chưa có tin tuyển dụng nào đang mở.</p>
                  {onNavigate && (
                    <button type="button" className="secondary-button" onClick={() => onNavigate("jobs")}>
                      + Tạo JD mới ngay
                    </button>
                  )}
                </div>
              ) : (
                <div className="dashboard-job-list">
                  {recentJobs.map((job) => (
                    <div key={job.jobId} className="dashboard-job-card">
                      <div className="job-info">
                        <strong>{job.title}</strong>
                        <small>{job.locationText ?? "Linh hoạt"} · {job.workMode ?? "Toàn thời gian"} · {job.openings} chỉ tiêu</small>
                        <div className="job-tags">
                          <span className={`status-pill ${job.status === "PUBLISHED" ? "success" : job.status === "CLOSED" ? "muted-pill" : "warning"}`}>
                            {job.status === "PUBLISHED" ? "Đang đăng" : job.status === "CLOSED" ? "Đã đóng" : "Bản nháp"}
                          </span>
                          {extractSkills(`${job.title} ${job.requirementsText}`).slice(0, 3).map((tech) => (
                            <span key={tech} className="tech-badge">{tech}</span>
                          ))}
                        </div>
                      </div>
                      {onNavigate && (
                        <button type="button" className="secondary-button compact-btn" onClick={() => onOpenJob ? onOpenJob(job.jobId) : onNavigate("jobs")}>
                          Xem ứng viên →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* AI Engine Insight */}
            <section className="workspace-panel ai-insight-card">
              <div className="ai-insight-header">
                <span className="brand-mark"><SparklesIcon size={16} /></span>
                <div>
                  <h4>AI Matching & Trích Xuất Bằng Chứng</h4>
                  <small>Công nghệ Explainable AI hỗ trợ đối soát kinh nghiệm và kỹ năng minh bạch</small>
                </div>
              </div>
              <p className="muted">
                Hệ thống tự động phân tích hồ sơ ứng viên đối sánh với tiêu chuẩn JD, cung cấp điểm số tương đồng và trích dẫn số trang PDF cụ thể làm bằng chứng kiểm chứng.
              </p>
            </section>
          </div>

          <div className="dashboard-side-col">
            {/* Quick Actions Shortcuts */}
            <section className="workspace-panel">
              <div className="section-heading">
                <h3>Phím tắt nhanh</h3>
              </div>
              <div className="quick-actions-vertical">
                {onNavigate && (
                  <>
                    <button type="button" className="shortcut-btn" onClick={() => onNavigate("jobs")}>
                      <span className="shortcut-icon"><JobsIcon size={16} /></span>
                      <div className="shortcut-meta">
                        <strong>Quản lý JD & Ứng viên</strong>
                        <small>Xem pipeline ứng viên và tạo tin mới</small>
                      </div>
                    </button>

                    <button type="button" className="shortcut-btn" onClick={() => onNavigate("company")}>
                      <span className="shortcut-icon"><CompanyIcon size={16} /></span>
                      <div className="shortcut-meta">
                        <strong>Hồ sơ công ty & Đội ngũ</strong>
                        <small>Quản lý phân quyền và mời thành viên</small>
                      </div>
                    </button>

                    <button type="button" className="shortcut-btn" onClick={() => onNavigate("profile")}>
                      <span className="shortcut-icon"><ProfileIcon size={16} /></span>
                      <div className="shortcut-meta">
                        <strong>Hồ sơ nhà tuyển dụng</strong>
                        <small>Cập nhật thông tin liên hệ và chức danh</small>
                      </div>
                    </button>

                    <button type="button" className="shortcut-btn" onClick={() => onNavigate("notifications")}>
                      <span className="shortcut-icon"><NotificationIcon size={16} /></span>
                      <div className="shortcut-meta">
                        <strong>Trung tâm thông báo</strong>
                        <small>Xem cập nhật hồ sơ mới và phân quyền</small>
                      </div>
                    </button>

                    <button type="button" className="shortcut-btn" onClick={() => onNavigate("security")}>
                      <span className="shortcut-icon"><SecurityIcon size={16} /></span>
                      <div className="shortcut-meta">
                        <strong>Bảo mật tài khoản</strong>
                        <small>Đổi mật khẩu và quản lý phiên đăng nhập</small>
                      </div>
                    </button>
                  </>
                )}
              </div>
            </section>

            {/* Recruiter Quality Checklist */}
            <section className="workspace-panel">
              <div className="section-heading">
                <h3>Tiêu chuẩn tuyển dụng hiệu quả</h3>
              </div>
              <ul className="profile-tips-list">
                <li><CheckCircleIcon size={14} /> Điền đầy đủ yêu cầu kỹ năng và số năm kinh nghiệm để đối soát chính xác</li>
                <li><CheckCircleIcon size={14} /> Tối ưu mô tả công việc bằng việc xác nhận ParsedJD AI</li>
                <li><CheckCircleIcon size={14} /> Phản hồi ứng viên trong 48h để giữ chân nhân tài</li>
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
