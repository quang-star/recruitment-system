import { MatchState, matchSummary } from "../application/matchPresentation";
import { useEffect, useState } from "react";

import { ApiClientError, apiDownload, apiRequest } from "../../shared/api/client";
import { usePagedResource } from "../../shared/api/pagination";
import { PageControls } from "../../shared/components/PageControls";
import { AuthSession } from "../../shared/auth/session";
import { ApplicationMatch, MatchBreakdown } from "../application/MatchBreakdown";
import { MatchRating } from "../application/MatchRating";
import { ReasonDialog } from "../../shared/components/ReasonDialog";
import { SparklesIcon, CvIcon } from "../../shared/components/Icon";
import { CvPreviewModal } from "../../shared/components/CvPreviewModal";

type Application = {
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

type StatusChange = {
  statusChangeId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  occurredAt: string;
};

type PipelineStage = {
  key: "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "REJECTED";
  label: string;
  icon: string;
  color: string;
  bgLight: string;
};

const PIPELINE_STAGES: PipelineStage[] = [
  { key: "SUBMITTED", label: "Mới ứng tuyển", icon: "📥", color: "#2563eb", bgLight: "#eff6ff" },
  { key: "UNDER_REVIEW", label: "Đang xem xét", icon: "🔍", color: "#d97706", bgLight: "#fffbeb" },
  { key: "SHORTLISTED", label: "Danh sách rút gọn", icon: "⭐", color: "#16a34a", bgLight: "#f0fdf4" },
  { key: "REJECTED", label: "Đã từ chối", icon: "🚫", color: "#64748b", bgLight: "#f8fafc" },
];

export function RecruiterApplicationsPanel({ session, jobId, canTransition }: {
  session: AuthSession; jobId: string | null; canTransition: boolean;
}) {
  const [applications, setApplications] = useState<Array<Application & { match?: ApplicationMatch | null; matchState?: MatchState }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, StatusChange[]>>({});
  const [workingApplicationId, setWorkingApplicationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "score">("newest");
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [previewCvTarget, setPreviewCvTarget] = useState<{ path: string; filename: string; title: string; page?: number } | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const results = usePagedResource<Application>(jobId ? "/api/v2/recruiter/applications" : null,
    { jobId: jobId ?? "", status: statusFilter, sort: sortBy, q: query }, session.accessToken, 10);
  const loading = results.loading;

  useEffect(() => {
    let active = true;
    setApplications(results.items.map((item) => ({ ...item, matchState: "loading" }))); setError(null);
    void (async () => {
      const withMatches = await Promise.all(results.items.map(async (application) => {
        if (application.matchingSupported === false || application.cvAccessGranted === false) return { ...application, match: null };
        try {
          const match = await apiRequest<ApplicationMatch>(`/api/v2/applications/${application.applicationId}/match`, { accessToken: session.accessToken });
          return { ...application, match, matchState: "ready" as const };
        } catch (failure) { return { ...application, match: null, matchState: failure instanceof ApiClientError && failure.status === 404 ? "waiting" as const : "error" as const }; }
      }));
      if (active) setApplications(withMatches);
    })()
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); });
    return () => { active = false; };
  }, [results.items, session.accessToken]);

  async function loadHistory(applicationId: string) {
    setWorkingApplicationId(applicationId); setError(null);
    try {
      const history = await apiRequest<StatusChange[]>(`/api/v2/applications/${applicationId}/history`, {
        accessToken: session.accessToken
      });
      setHistories((current) => ({ ...current, [applicationId]: history }));
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setWorkingApplicationId(null); }
  }

  async function transition(application: Application, status: "UNDER_REVIEW" | "SHORTLISTED" | "REJECTED", reason: string | null = null) {
    setRejectTarget(null);
    setWorkingApplicationId(application.applicationId); setError(null); setMessage(null);
    try {
      const updated = await apiRequest<Application>(`/api/v2/recruiter/applications/${application.applicationId}/status`, {
        method: "PATCH", accessToken: session.accessToken,
        body: JSON.stringify({ status, reason, version: application.version })
      });
      setApplications((current) => current.map((item) => item.applicationId === updated.applicationId
        ? { ...item, ...updated }
        : item));
      setMessage(`Đã chuyển hồ sơ sang ${translateApplicationStatus(status)}.`);
      await loadHistory(application.applicationId);
      results.refresh();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setWorkingApplicationId(null); }
  }

  async function downloadCv(applicationId: string) {
    setWorkingApplicationId(applicationId); setError(null);
    try {
      const download = await apiDownload(`/api/v2/recruiter/applications/${applicationId}/cv`, {
        accessToken: session.accessToken
      });
      const objectUrl = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = download.filename;
      link.rel = "noopener";
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setWorkingApplicationId(null); }
  }

  function viewCvEvidence(applicationId: string, page: number) {
    setPreviewCvTarget({
      path: `/api/v2/recruiter/applications/${applicationId}/cv`,
      filename: `ung-vien-${applicationId.slice(0, 8)}.pdf`,
      title: `CV Ứng viên (Bằng chứng trang ${page})`,
      page
    });
  }

  function handleDragStart(e: React.DragEvent, application: Application) {
    e.dataTransfer.setData("text/plain", application.applicationId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, targetStatus: "SUBMITTED" | "UNDER_REVIEW" | "SHORTLISTED" | "REJECTED") {
    e.preventDefault();
    setDragOverStage(null);
    const applicationId = e.dataTransfer.getData("text/plain");
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!app || !canTransition) return;
    if (app.status === targetStatus) return;

    if (targetStatus === "REJECTED") {
      setRejectTarget(app);
    } else if (targetStatus === "UNDER_REVIEW" && app.status === "SUBMITTED") {
      void transition(app, "UNDER_REVIEW");
    } else if (targetStatus === "SHORTLISTED" && app.status === "UNDER_REVIEW") {
      void transition(app, "SHORTLISTED");
    } else {
      setError(`Không thể chuyển trực tiếp từ ${translateApplicationStatus(app.status)} sang ${translateApplicationStatus(targetStatus)}.`);
    }
  }

  if (!jobId) return null;

  const visibleApplications = applications.filter((item) => results.items.some((row) => row.applicationId === item.applicationId));
  const activeSelectedApp = visibleApplications.find((item) => item.applicationId === selectedId) ?? visibleApplications[0];

  const renderApplicationDetail = (application: Application & { match?: ApplicationMatch | null; matchState?: MatchState }) => (
    <article className="application-detail modern-app-card" key={application.applicationId}>
      <div className="application-item modern-card-header">
        <div className="candidate-meta-block">
          <div className="candidate-avatar-circle">
            {application.candidateName
              ? application.candidateName.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase()
              : application.candidateUserId.slice(0, 2).toUpperCase()}
          </div>
          <div className="candidate-profile-text">
            <strong>{application.candidateName || `Ứng viên ${application.candidateUserId.slice(0, 8)}…`}</strong>
            {application.candidateHeadline && <p className="candidate-headline-text">{application.candidateHeadline}</p>}
            <div className="candidate-contact-tags">
              <small>Nộp ngày {new Date(application.appliedAt).toLocaleString("vi-VN")}</small>
              {application.candidateEmail && <span className="contact-tag">✉️ {application.candidateEmail}</span>}
              {application.candidatePhone && <span className="contact-tag">📞 {application.candidatePhone}</span>}
              <small className="muted"> · Mã: {application.applicationId.slice(0, 8)}</small>
            </div>
          </div>
        </div>

        <div className="header-badge-group">
          <span className={`status-pill ${
            application.status === "SHORTLISTED" ? "success" :
            application.status === "UNDER_REVIEW" ? "warning" :
            application.status === "REJECTED" ? "danger" : "muted"
          }`}>
            {translateApplicationStatus(application.status)}
          </span>
        </div>
      </div>

      {application.coverLetter && (
        <div className="cover-letter modern-cover-letter">
          <strong>Thư ứng tuyển:</strong>
          <p>{application.coverLetter}</p>
        </div>
      )}

      {application.match ? (
        <div className="match-section-wrap">
          <MatchBreakdown match={application.match} onViewCv={(page) => void viewCvEvidence(application.applicationId, page)} />
        </div>
      ) : (
        <p className="muted">{application.cvAccessGranted === false ? "Ứng viên đã thu hồi quyền xem CV và điểm." : application.matchingSupported === false ? "Ngành này chưa hỗ trợ AI; xem xét hồ sơ thủ công." : matchSummary(application)}</p>
      )}

      {application.matchState === "error" && <p className="error-message" role="alert">Không tải được kết quả đối chiếu. <button type="button" className="secondary-button" onClick={results.refresh}>Thử lại điểm</button></p>}

      {/* Actions row */}
      <div className="button-row application-actions modern-app-actions">
        <button
          className="primary-action-btn prominent-cv-btn"
          type="button"
          disabled={workingApplicationId === application.applicationId || application.cvAccessGranted === false}
          onClick={() => setPreviewCvTarget({
            path: `/api/v2/recruiter/applications/${application.applicationId}/cv`,
            filename: `ung-vien-${application.candidateUserId.slice(0, 8)}.pdf`,
            title: `CV ${application.candidateName || `Ứng viên ${application.candidateUserId.slice(0, 8)}…`}`
          })}
        >
          📄 Xem CV trực tiếp
        </button>

        <button
          className="secondary-button"
          type="button"
          disabled={workingApplicationId === application.applicationId || application.cvAccessGranted === false}
          onClick={() => void downloadCv(application.applicationId)}
        >
          Tải CV đã nộp
        </button>

        <button
          className="secondary-button"
          type="button"
          disabled={workingApplicationId === application.applicationId}
          onClick={() => void loadHistory(application.applicationId)}
        >
          Xem tiến trình
        </button>

        {canTransition && application.status === "SUBMITTED" && (
          <button
            type="button"
            className="primary-action-btn"
            disabled={workingApplicationId === application.applicationId}
            onClick={() => void transition(application, "UNDER_REVIEW")}
          >
            Bắt đầu xem xét
          </button>
        )}

        {canTransition && application.status === "UNDER_REVIEW" && (
          <button
            type="button"
            className="success-action-btn"
            disabled={workingApplicationId === application.applicationId}
            onClick={() => void transition(application, "SHORTLISTED")}
          >
            Đưa vào shortlist
          </button>
        )}

        {canTransition && ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"].includes(application.status) && (
          <button
            className="danger-button"
            type="button"
            disabled={workingApplicationId === application.applicationId}
            onClick={() => setRejectTarget(application)}
          >
            Từ chối
          </button>
        )}
      </div>

      {histories[application.applicationId] && (
        <ol className="status-timeline modern-timeline">
          {histories[application.applicationId].map((change) => (
            <li key={change.statusChangeId}>
              <strong>{translateApplicationStatus(change.toStatus)}</strong>
              <span>{new Date(change.occurredAt).toLocaleString("vi-VN")}</span>
              {change.reason && <small>Lý do: {change.reason}</small>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );

  return (
    <div className="workspace-panel recruiter-applications modern-pipeline-panel">
      {/* Heading */}
      <div className="section-heading">
        <div>
          <p className="eyebrow">SÀNG LỌC HỒ SƠ</p>
          <h3>Ứng viên</h3>
        </div>
        <div className="button-row" style={{ alignItems: "center", gap: "10px" }}>
          {/* View Mode Toggle */}
          <div className="view-mode-toggle" role="group" aria-label="Chế độ xem">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
            >
              📋 Danh sách
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === "kanban" ? "active" : ""}`}
              onClick={() => setViewMode("kanban")}
            >
              📊 Bảng Kanban
            </button>
          </div>

          <span className="count-badge">{results.total} hồ sơ</span>
          <button className="secondary-button compact-btn" type="button" onClick={results.refresh}>
            Làm mới
          </button>
        </div>
      </div>

      {/* Modern Stage Tabs (for Table View filtering) */}
      {viewMode === "table" && (
        <div className="pipeline-stage-tabs">
          <button
            type="button"
            className={`stage-tab-btn ${statusFilter === "" ? "active" : ""}`}
            onClick={() => setStatusFilter("")}
          >
            Tất cả
          </button>
          <button
            type="button"
            className={`stage-tab-btn ${statusFilter === "SUBMITTED" ? "active" : ""}`}
            onClick={() => setStatusFilter("SUBMITTED")}
          >
            Mới nộp
          </button>
          <button
            type="button"
            className={`stage-tab-btn ${statusFilter === "UNDER_REVIEW" ? "active" : ""}`}
            onClick={() => setStatusFilter("UNDER_REVIEW")}
          >
            Đang xem xét
          </button>
          <button
            type="button"
            className={`stage-tab-btn ${statusFilter === "SHORTLISTED" ? "active" : ""}`}
            onClick={() => setStatusFilter("SHORTLISTED")}
          >
            Shortlist
          </button>
          <button
            type="button"
            className={`stage-tab-btn ${statusFilter === "REJECTED" ? "active" : ""}`}
            onClick={() => setStatusFilter("REJECTED")}
          >
            Đã từ chối
          </button>
        </div>
      )}

      {/* Toolbar for Sorting & Backwards-compatible Filter */}
      <div className="pipeline-toolbar">
        <label>Tìm hồ sơ<input value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder="Mã ứng viên, vị trí hoặc thư ứng tuyển" /></label>
        <label>
          Trạng thái
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="SUBMITTED">Mới ứng tuyển</option>
            <option value="UNDER_REVIEW">Đang xem xét</option>
            <option value="SHORTLISTED">Danh sách rút gọn</option>
            <option value="REJECTED">Đã từ chối</option>
            <option value="WITHDRAWN">Đã rút</option>
          </select>
        </label>
        <label>
          Sắp xếp
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "newest" | "score")}>
            <option value="newest">Mới nhất</option>
            <option value="score">Mức độ phù hợp</option>
          </select>
        </label>
      </div>

      <PageControls {...results} onPageChange={results.setPage} label="Phân trang ứng viên" />
      {results.error && <p className="error-message" role="alert">{results.error}</p>}

      {/* AI Decision Transparent Notice */}
      <div className="ai-decision-note-box">
        <SparklesIcon size={16} />
        <p className="ai-decision-note">
          Mức độ phù hợp với vị trí trên thang 1–5 sao hỗ trợ xem hồ sơ, không phải xác suất trúng tuyển. Quyết định tuyển dụng do bạn thực hiện.
        </p>
      </div>

      {loading && <p className="muted">Đang tải hồ sơ…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}
      {!loading && !error && !results.error && results.total === 0 && (
        <div className="empty-sub-state">
          <CvIcon size={32} />
          <p className="muted">Không có hồ sơ phù hợp bộ lọc hiện tại.</p>
        </div>
      )}

      {/* VIEW MODE 1: Table Master-Detail */}
      {viewMode === "table" && (
        <div className="application-master-detail">
          <div className="application-table-wrap">
            <table className="application-table"><caption className="sr-only">Danh sách ứng viên</caption>
              <thead><tr><th>Hồ sơ</th><th>Ngày nộp</th><th>Trạng thái</th><th>Mức độ phù hợp</th></tr></thead>
              <tbody>{visibleApplications.map((application) => <tr key={application.applicationId}
                className={(selectedId ?? visibleApplications[0]?.applicationId) === application.applicationId ? "selected" : ""}>
                <td>
                  <div className="candidate-cell-flex">
                    <div className="candidate-avatar-circle mini">
                      {application.candidateName
                        ? application.candidateName.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase()
                        : application.candidateUserId.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <button type="button" className="text-button candidate-name-btn" aria-pressed={(selectedId ?? visibleApplications[0]?.applicationId) === application.applicationId}
                        onClick={() => setSelectedId(application.applicationId)}>{application.candidateName || `Ứng viên ${application.candidateUserId.slice(0, 8)}…`}</button>
                      <div className="candidate-submeta">
                        {application.candidateHeadline && <span className="candidate-headline-pill">{application.candidateHeadline}</span>}
                        <small>Hồ sơ {application.applicationId.slice(0, 8)}</small>
                      </div>
                    </div>
                  </div>
                </td>
                <td>{new Date(application.appliedAt).toLocaleDateString("vi-VN")}</td>
                <td><span className="status-pill">{translateApplicationStatus(application.status)}</span></td>
                <td><MatchRating {...application} compact />{application.match?.status === "DEGRADED" && <small className="match-rating-quality">Cần kiểm tra thêm</small>}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="application-selected-panel" aria-label="Hồ sơ ứng viên đã chọn">
            {activeSelectedApp && renderApplicationDetail(activeSelectedApp)}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: Kanban Pipeline Board */}
      {viewMode === "kanban" && (
        <div className="kanban-pipeline-wrapper">
          <div className="kanban-pipeline-board" role="region" aria-label="Bảng Kanban tuyển dụng">
            {PIPELINE_STAGES.map((stage) => {
              const stageApps = visibleApplications.filter((app) => app.status === stage.key);
              const isOver = dragOverStage === stage.key;
              return (
                <div
                  key={stage.key}
                  className={`kanban-column ${isOver ? "drag-over" : ""}`}
                  data-stage={stage.key}
                  onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.key); }}
                  onDragLeave={() => { if (dragOverStage === stage.key) setDragOverStage(null); }}
                  onDrop={(e) => handleDrop(e, stage.key)}
                >
                  <div className="kanban-column-header" style={{ borderTopColor: stage.color }}>
                    <div className="kanban-column-title">
                      <span className="kanban-stage-icon">{stage.icon}</span>
                      <h4>{stage.label}</h4>
                    </div>
                    <span className="kanban-stage-count" style={{ backgroundColor: stage.bgLight, color: stage.color }}>
                      {stageApps.length}
                    </span>
                  </div>

                  <div className="kanban-cards-container">
                    {stageApps.length === 0 ? (
                      <div className="kanban-empty-column">
                        <small>Chưa có hồ sơ</small>
                      </div>
                    ) : (
                      stageApps.map((application) => (
                        <div
                          key={application.applicationId}
                          className={`kanban-card ${selectedId === application.applicationId ? "selected" : ""} ${workingApplicationId === application.applicationId ? "working" : ""}`}
                          data-stage={stage.key}
                          draggable={canTransition}
                          onDragStart={(e) => handleDragStart(e, application)}
                          onClick={() => setSelectedId(application.applicationId)}
                        >
                          <div className="kanban-card-top">
                            <div className="candidate-avatar-circle small">
                              {application.candidateName
                                ? application.candidateName.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase()
                                : application.candidateUserId.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="kanban-card-info">
                              <strong>{application.candidateName || `Ứng viên ${application.candidateUserId.slice(0, 8)}…`}</strong>
                              {application.candidateHeadline && <span className="kanban-card-headline">{application.candidateHeadline}</span>}
                              <small>{new Date(application.appliedAt).toLocaleDateString("vi-VN")}</small>
                            </div>
                          </div>

                          <div className="kanban-card-score">
                            <MatchRating {...application} compact />
                            {application.match?.status === "DEGRADED" && <small className="match-rating-quality">Cần kiểm tra thêm</small>}
                          </div>

                          {application.coverLetter && (
                            <p className="kanban-cover-preview">
                              "{application.coverLetter.slice(0, 75)}{application.coverLetter.length > 75 ? "…" : ""}"
                            </p>
                          )}

                          <div className="kanban-card-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="kanban-action-btn view-cv-btn"
                              title="Xem CV PDF trực tiếp"
                              disabled={workingApplicationId === application.applicationId || application.cvAccessGranted === false}
                              onClick={() => setPreviewCvTarget({
                                path: `/api/v2/recruiter/applications/${application.applicationId}/cv`,
                                filename: `ung-vien-${application.candidateUserId.slice(0, 8)}.pdf`,
                                title: `CV Ứng viên ${application.candidateUserId.slice(0, 8)}…`
                              })}
                            >
                              👁️ CV
                            </button>

                            {canTransition && application.status === "SUBMITTED" && (
                              <button
                                type="button"
                                className="kanban-action-btn transition-btn primary"
                                disabled={workingApplicationId === application.applicationId}
                                onClick={() => void transition(application, "UNDER_REVIEW")}
                                title="Chuyển sang Đang xem xét"
                              >
                                ➡️ Xem xét
                              </button>
                            )}

                            {canTransition && application.status === "UNDER_REVIEW" && (
                              <button
                                type="button"
                                className="kanban-action-btn transition-btn success"
                                disabled={workingApplicationId === application.applicationId}
                                onClick={() => void transition(application, "SHORTLISTED")}
                                title="Chuyển vào Danh sách rút gọn"
                              >
                                ⭐ Shortlist
                              </button>
                            )}

                            {canTransition && ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"].includes(application.status) && (
                              <button
                                type="button"
                                className="kanban-action-btn transition-btn danger"
                                disabled={workingApplicationId === application.applicationId}
                                onClick={() => setRejectTarget(application)}
                                title="Từ chối hồ sơ này"
                              >
                                ✖ Từ chối
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {activeSelectedApp && (
            <div className="kanban-selected-detail">
              <div className="section-heading" style={{ marginTop: "1.5rem" }}>
                <div>
                  <p className="eyebrow">CHI TIẾT HỒ SƠ ĐÃ CHỌN</p>
                  <h4>{activeSelectedApp.candidateName || `Ứng viên ${activeSelectedApp.candidateUserId.slice(0, 8)}…`}</h4>
                </div>
              </div>
              {renderApplicationDetail(activeSelectedApp)}
            </div>
          )}
        </div>
      )}

      <ReasonDialog
        open={rejectTarget !== null}
        title="Từ chối hồ sơ"
        confirmLabel="Xác nhận từ chối"
        description="Lý do sẽ được lưu trong lịch sử và hiển thị cho ứng viên."
        onCancel={() => setRejectTarget(null)}
        onConfirm={(reason) => { if (rejectTarget) void transition(rejectTarget, "REJECTED", reason); }}
      />

      <CvPreviewModal
        open={previewCvTarget !== null}
        onClose={() => setPreviewCvTarget(null)}
        downloadPath={previewCvTarget?.path ?? ""}
        filename={previewCvTarget?.filename}
        title={previewCvTarget?.title}
        page={previewCvTarget?.page}
        accessToken={session.accessToken}
      />
    </div>
  );
}

function translateApplicationStatus(status: string): string {
  return ({
    SUBMITTED: "Mới ứng tuyển",
    UNDER_REVIEW: "Đang xem xét",
    SHORTLISTED: "Danh sách rút gọn",
    REJECTED: "Đã từ chối",
    WITHDRAWN: "Đã rút"
  } as Record<string, string>)[status] ?? status;
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể tải danh sách ứng viên.";
}
