import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { ApplicationMatch, MatchBreakdown } from "../application/MatchBreakdown";
import { ReasonDialog } from "../../shared/components/ReasonDialog";

type Job = { jobId: string; title: string; description: string; requirementsText: string; locationText: string | null; workMode: string | null; employmentType: string | null; openings: number; companyId: string; };
type Cv = { cvId: string; title: string; activeVersion: { cvVersionId: string; processingStatus: string; }; };
type Application = { applicationId: string; jobId: string; status: string; appliedAt: string; version: number; match?: ApplicationMatch | null; };
type StatusChange = { statusChangeId: string; fromStatus: string | null; toStatus: string; reason: string | null; occurredAt: string; };

export function CandidateJobsPanel({ session }: { session: AuthSession }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobId, setJobId] = useState("");
  const [cvId, setCvId] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, StatusChange[]>>({});
  const [workingApplicationId, setWorkingApplicationId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null);
  const submissionKey = useRef(crypto.randomUUID());

  function startNewSubmission() { submissionKey.current = crypto.randomUUID(); }

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<Job[]>("/api/v1/candidate/jobs", { accessToken: session.accessToken }),
      apiRequest<Cv[]>("/api/v1/cvs", { accessToken: session.accessToken }),
      apiRequest<Application[]>("/api/v1/candidate/applications", { accessToken: session.accessToken })
    ]).then(async ([jobResult, cvResult, applicationResult]) => {
      if (!active) return;
      const withMatches = await Promise.all(applicationResult.map(async (application) => {
        try {
          const match = await apiRequest<ApplicationMatch>(`/api/v1/applications/${application.applicationId}/match`, { accessToken: session.accessToken });
          return { ...application, match };
        } catch { return { ...application, match: null }; }
      }));
      if (!active) return;
      setJobs(jobResult); setCvs(cvResult); setApplications(withMatches);
      setJobId(jobResult[0]?.jobId ?? "");
      setCvId(cvResult.find((cv) => cv.activeVersion.processingStatus === "CONFIRMED")?.cvId ?? "");
    }).catch((requestError) => { if (active) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.accessToken]);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!jobId || !cvId || !consentAccepted || submitting) return;
    setSubmitting(true); setMessage(null); setError(null);
    try {
      const created = await apiRequest<Application>("/api/v1/candidate/applications", {
        method: "POST", accessToken: session.accessToken,
        idempotencyKey: submissionKey.current,
        body: JSON.stringify({
          jobId, cvId,
          cvVersionId: confirmedCvs.find((cv) => cv.cvId === cvId)?.activeVersion.cvVersionId,
          coverLetter: coverLetter.trim() || null,
          consentAccepted, policyVersion: "cv-sharing-v1"
        })
      });
      setApplications((current) => current.some((item) => item.applicationId === created.applicationId)
        ? current
        : [{ ...created, match: null }, ...current]);
      setCoverLetter(""); startNewSubmission();
      setApplyOpen(false);
      setMessage("Đã gửi hồ sơ ứng tuyển. Matching sẽ cập nhật bất đồng bộ.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSubmitting(false); }
  }

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

  async function withdraw(application: Application, reason: string) {
    setWithdrawTarget(null);
    setWorkingApplicationId(application.applicationId); setMessage(null); setError(null);
    try {
      const updated = await apiRequest<Application>(
        `/api/v1/candidate/applications/${application.applicationId}/withdraw`, {
          method: "POST", accessToken: session.accessToken,
          body: JSON.stringify({ reason, version: application.version })
        });
      setApplications((current) => current.map((item) => item.applicationId === updated.applicationId
        ? { ...item, ...updated }
        : item));
      setMessage("Đã rút hồ sơ ứng tuyển.");
      await loadHistory(application.applicationId);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setWorkingApplicationId(null); }
  }

  if (loading) return <section className="cv-panel"><p className="muted">Đang tải Job và hồ sơ ứng tuyển…</p></section>;
  const confirmedCvs = cvs.filter((cv) => cv.activeVersion.processingStatus === "CONFIRMED");
  const selectedJob = jobs.find((job) => job.jobId === jobId);
  const filteredJobs = jobs.filter((job) => {
    const normalizedQuery = query.trim().toLowerCase();
    return (!normalizedQuery || `${job.title} ${job.description} ${job.locationText ?? ""}`.toLowerCase().includes(normalizedQuery))
      && (!workMode || job.workMode === workMode);
  });
  return <section className="cv-panel candidate-jobs" aria-labelledby="candidate-jobs-title">
    <div className="section-heading"><div><p className="eyebrow">Open positions</p><h2 id="candidate-jobs-title">Job đang tuyển</h2></div><span>{jobs.length} Job</span></div>
    <div className="job-filters"><label>Tìm kiếm<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chức danh, kỹ năng hoặc địa điểm" /></label>
      <label>Hình thức<select value={workMode} onChange={(event) => setWorkMode(event.target.value)}><option value="">Tất cả</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option><option value="ONSITE">Tại văn phòng</option></select></label></div>
    {jobs.length === 0 ? <p className="muted">Hiện chưa có Job đang tuyển.</p> : <div className="job-discovery-layout">
      <div className="job-card-list">{filteredJobs.map((job) => <button type="button" key={job.jobId}
        className={`job-card ${job.jobId === jobId ? "selected" : ""}`} onClick={() => setJobId(job.jobId)}>
        <span><strong>{job.title}</strong><small>{job.locationText ?? "Địa điểm linh hoạt"} · {translateWorkMode(job.workMode)}</small></span>
        <span className="status-pill">{job.employmentType ?? "Toàn thời gian"}</span>
      </button>)}{filteredJobs.length === 0 && <p className="muted">Không có Job phù hợp bộ lọc.</p>}</div>
      {selectedJob && <article className="job-detail-card"><p className="eyebrow">Chi tiết vị trí</p><h3>{selectedJob.title}</h3>
        <div className="job-meta"><span>{selectedJob.locationText ?? "Linh hoạt"}</span><span>{translateWorkMode(selectedJob.workMode)}</span><span>{selectedJob.openings} vị trí</span></div>
        <p>{selectedJob.description}</p><h4>Yêu cầu</h4><p>{selectedJob.requirementsText}</p>
        <button type="button" onClick={() => setApplyOpen(true)}>Ứng tuyển vị trí này</button></article>}
    </div>}
    {applyOpen && <div className="modal-backdrop" role="presentation"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="apply-title">
      <div className="section-heading"><div><p className="eyebrow">Ứng tuyển vị trí</p><h2 id="apply-title">{selectedJob?.title}</h2></div><button type="button" className="icon-button secondary-button" aria-label="Đóng" onClick={() => setApplyOpen(false)}>×</button></div>
      <form className="application-form" onSubmit={apply}>
      <label>CV đã xác nhận<select value={cvId} onChange={(event) => { setCvId(event.target.value); startNewSubmission(); }} disabled={!confirmedCvs.length}>{confirmedCvs.length ? confirmedCvs.map((cv) => <option key={cv.cvId} value={cv.cvId}>{cv.title}</option>) : <option value="">Cần xác nhận ParsedCV trước</option>}</select></label>
      <label>Thư ứng tuyển (không bắt buộc)<textarea value={coverLetter} maxLength={5000} rows={5}
        onChange={(event) => { setCoverLetter(event.target.value); startNewSubmission(); }}
        placeholder="Giới thiệu ngắn về sự phù hợp của bạn với vị trí…" /></label>
      <label className="consent-check"><input type="checkbox" checked={consentAccepted} onChange={(event) => { setConsentAccepted(event.target.checked); startNewSubmission(); }} /> Cho phép recruiter xem CV này cho application (policy cv-sharing-v1)</label>
      <button type="submit" disabled={!confirmedCvs.length || !consentAccepted || submitting}>{submitting ? "Đang gửi…" : "Ứng tuyển"}</button>
      </form></section></div>}
    {message && <p className="success-message" role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    {applications.length > 0 && <div className="application-list"><h3>Lịch sử ứng tuyển</h3>{applications.map((application) => <article className="application-detail" key={application.applicationId}>
      <div className="application-item"><span>{jobs.find((job) => job.jobId === application.jobId)?.title ?? application.jobId}<small>{new Date(application.appliedAt).toLocaleString()}</small></span><span className="status-pill">{translateApplicationStatus(application.status)}</span></div>
      {application.match ? <MatchBreakdown match={application.match} /> : <p className="muted">Matching đang chờ xử lý. Hãy tải lại trang sau ít phút.</p>}
      <div className="button-row">
        <button className="secondary-button" type="button" disabled={workingApplicationId === application.applicationId}
          onClick={() => void loadHistory(application.applicationId)}>
          {workingApplicationId === application.applicationId ? "Đang tải…" : "Xem tiến trình"}
        </button>
        {["SUBMITTED", "UNDER_REVIEW"].includes(application.status) && <button className="danger-button" type="button"
          disabled={workingApplicationId === application.applicationId} onClick={() => setWithdrawTarget(application)}>Rút hồ sơ</button>}
      </div>
      {histories[application.applicationId] && <ol className="status-timeline">
        {histories[application.applicationId].map((change) => <li key={change.statusChangeId}>
          <strong>{change.toStatus}</strong><span>{new Date(change.occurredAt).toLocaleString()}</span>
          {change.reason && <small>Lý do: {change.reason}</small>}
        </li>)}
      </ol>}
    </article>)}</div>}
    <ReasonDialog open={withdrawTarget !== null} title="Rút hồ sơ ứng tuyển" confirmLabel="Xác nhận rút hồ sơ"
      description="Hành động này sẽ được ghi vào lịch sử ứng tuyển và không thể hoàn tác."
      onCancel={() => setWithdrawTarget(null)} onConfirm={(reason) => { if (withdrawTarget) void withdraw(withdrawTarget, reason); }} />
  </section>;
}

function translateWorkMode(value: string | null): string {
  return ({ REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "Tại văn phòng" } as Record<string, string>)[value ?? ""] ?? "Linh hoạt";
}

function translateApplicationStatus(status: string): string {
  return ({ SUBMITTED: "Mới ứng tuyển", UNDER_REVIEW: "Đang xem xét", SHORTLISTED: "Danh sách rút gọn", REJECTED: "Đã từ chối", WITHDRAWN: "Đã rút" } as Record<string, string>)[status] ?? status;
}

function getErrorMessage(error: unknown): string { return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại."; }
