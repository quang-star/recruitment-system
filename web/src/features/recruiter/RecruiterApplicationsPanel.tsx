import { useEffect, useState } from "react";

import { ApiClientError, apiDownload, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { ApplicationMatch, MatchBreakdown } from "../application/MatchBreakdown";
import { ReasonDialog } from "../../shared/components/ReasonDialog";

type Application = { applicationId: string; candidateUserId: string; coverLetter: string | null; status: string; appliedAt: string; version: number; };
type StatusChange = { statusChangeId: string; fromStatus: string | null; toStatus: string; reason: string | null; occurredAt: string; };

export function RecruiterApplicationsPanel({ session, jobId, canTransition }: {
  session: AuthSession; jobId: string | null; canTransition: boolean;
}) {
  const [applications, setApplications] = useState<Array<Application & { match?: ApplicationMatch | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, StatusChange[]>>({});
  const [workingApplicationId, setWorkingApplicationId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "score">("newest");
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);

  useEffect(() => {
    let active = true;
    if (!jobId) { setApplications([]); return () => { active = false; }; }
    setLoading(true); setError(null);
    void apiRequest<Application[]>(`/api/v1/recruiter/applications?jobId=${jobId}`, { accessToken: session.accessToken })
      .then(async (items) => {
        const withMatches = await Promise.all(items.map(async (application) => {
          try {
            const match = await apiRequest<ApplicationMatch>(`/api/v1/applications/${application.applicationId}/match`, { accessToken: session.accessToken });
            return { ...application, match };
          } catch { return { ...application, match: null }; }
        }));
        if (active) setApplications(withMatches);
      })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId, reloadNonce, session.accessToken]);

  async function loadHistory(applicationId: string) {
    setWorkingApplicationId(applicationId); setError(null);
    try {
      const history = await apiRequest<StatusChange[]>(`/api/v1/applications/${applicationId}/history`, {
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
      const updated = await apiRequest<Application>(`/api/v1/recruiter/applications/${application.applicationId}/status`, {
        method: "PATCH", accessToken: session.accessToken,
        body: JSON.stringify({ status, reason, version: application.version })
      });
      setApplications((current) => current.map((item) => item.applicationId === updated.applicationId
        ? { ...item, ...updated }
        : item));
      setMessage(`Đã chuyển hồ sơ sang ${status}.`);
      await loadHistory(application.applicationId);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setWorkingApplicationId(null); }
  }

  async function downloadCv(applicationId: string) {
    setWorkingApplicationId(applicationId); setError(null);
    try {
      const download = await apiDownload(`/api/v1/recruiter/applications/${applicationId}/cv`, {
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

  if (!jobId) return null;
  const visibleApplications = applications.filter((application) => !statusFilter || application.status === statusFilter)
    .sort((left, right) => sortBy === "score"
      ? (right.match?.finalScore ?? -1) - (left.match?.finalScore ?? -1)
      : new Date(right.appliedAt).getTime() - new Date(left.appliedAt).getTime());
  return <div className="workspace-panel recruiter-applications">
    <div className="section-heading"><div><p className="eyebrow">Explainable pipeline</p><h3>Ứng viên</h3></div><div className="button-row"><span>{applications.length}</span><button className="secondary-button" type="button" onClick={() => setReloadNonce((value) => value + 1)}>Làm mới</button></div></div>
    <div className="pipeline-toolbar"><label>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tất cả</option><option value="SUBMITTED">Mới ứng tuyển</option><option value="UNDER_REVIEW">Đang xem xét</option><option value="SHORTLISTED">Danh sách rút gọn</option><option value="REJECTED">Đã từ chối</option></select></label>
      <label>Sắp xếp<select value={sortBy} onChange={(event) => setSortBy(event.target.value as "newest" | "score")}><option value="newest">Mới nhất</option><option value="score">Điểm phù hợp</option></select></label></div>
    <p className="ai-decision-note">✦ AI hỗ trợ giải thích mức độ phù hợp; quyết định tuyển dụng luôn do con người thực hiện.</p>
    {loading && <p className="muted">Đang tải hồ sơ…</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p className="success-message" role="status">{message}</p>}
    {!loading && !error && applications.length === 0 && <p className="muted">Chưa có ứng viên cho JD này.</p>}
    {visibleApplications.map((application) => <article className="application-detail" key={application.applicationId}>
      <div className="application-item">
        <span><strong>{application.candidateUserId.slice(0, 8)}…</strong><small>{new Date(application.appliedAt).toLocaleString()}</small></span>
        <span className="status-pill">{translateApplicationStatus(application.status)}</span>
      </div>
      {application.coverLetter && <div className="cover-letter"><strong>Thư ứng tuyển</strong><p>{application.coverLetter}</p></div>}
      {application.match ? <MatchBreakdown match={application.match} /> : <p className="muted">Matching đang chờ hoặc chưa đủ dữ liệu.</p>}
      <div className="button-row application-actions">
        <button className="secondary-button" type="button" disabled={workingApplicationId === application.applicationId}
          onClick={() => void downloadCv(application.applicationId)}>Tải CV snapshot</button>
        <button className="secondary-button" type="button" disabled={workingApplicationId === application.applicationId}
          onClick={() => void loadHistory(application.applicationId)}>Xem tiến trình</button>
        {canTransition && application.status === "SUBMITTED" && <button type="button" disabled={workingApplicationId === application.applicationId}
          onClick={() => void transition(application, "UNDER_REVIEW")}>Bắt đầu xem xét</button>}
        {canTransition && application.status === "UNDER_REVIEW" && <button type="button" disabled={workingApplicationId === application.applicationId}
          onClick={() => void transition(application, "SHORTLISTED")}>Đưa vào shortlist</button>}
        {canTransition && ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"].includes(application.status) && <button className="danger-button" type="button"
          disabled={workingApplicationId === application.applicationId} onClick={() => setRejectTarget(application)}>Từ chối</button>}
      </div>
      {histories[application.applicationId] && <ol className="status-timeline">
        {histories[application.applicationId].map((change) => <li key={change.statusChangeId}>
          <strong>{change.toStatus}</strong><span>{new Date(change.occurredAt).toLocaleString()}</span>
          {change.reason && <small>Lý do: {change.reason}</small>}
        </li>)}
      </ol>}
    </article>)}
    <ReasonDialog open={rejectTarget !== null} title="Từ chối hồ sơ" confirmLabel="Xác nhận từ chối"
      description="Lý do sẽ được lưu trong lịch sử và hiển thị cho ứng viên."
      onCancel={() => setRejectTarget(null)} onConfirm={(reason) => { if (rejectTarget) void transition(rejectTarget, "REJECTED", reason); }} />
  </div>;
}

function translateApplicationStatus(status: string): string {
  return ({ SUBMITTED: "Mới ứng tuyển", UNDER_REVIEW: "Đang xem xét", SHORTLISTED: "Danh sách rút gọn", REJECTED: "Đã từ chối", WITHDRAWN: "Đã rút" } as Record<string, string>)[status] ?? status;
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể tải danh sách ứng viên.";
}
