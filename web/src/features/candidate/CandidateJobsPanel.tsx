import { MatchState, matchSummary } from "../application/matchPresentation";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { CategoryFilterValue, emptyCategoryFilter, JobCategoryFilter } from "../recruiter/JobCategoryFilter";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { PageResult, usePagedResource } from "../../shared/api/pagination";
import { PageControls } from "../../shared/components/PageControls";
import { AuthSession } from "../../shared/auth/session";
import { ApplicationMatch, MatchBreakdown } from "../application/MatchBreakdown";
import { getPendingJobId, setPendingJobId } from "../../shared/pendingApplication";
import { ReasonDialog } from "../../shared/components/ReasonDialog";
import { useModalFocus } from "../../shared/components/useModalFocus";

type Job = { jobId: string; title: string; description: string; requirementsText: string; locationText: string | null; workMode: string | null; employmentType: string | null; openings: number; companyId: string; };
type Cv = { cvId: string; title: string; activeVersion: { cvVersionId: string; processingStatus: string; }; };
type Application = { applicationId: string; jobId: string; status: string; appliedAt: string; version: number; matchingSupported?: boolean; cvAccessGranted?: boolean; match?: ApplicationMatch | null; matchState?: MatchState; };
type StatusChange = { statusChangeId: string; fromStatus: string | null; toStatus: string; reason: string | null; occurredAt: string; };

type Props = {
  session: AuthSession;
  initialJobId?: string;
  applicationsOnly?: boolean;
  dialogOnly?: boolean;
  onClose?: () => void;
  onApplied?: (message: string) => void;
};

export function CandidateJobsPanel({ session, initialJobId, applicationsOnly = false, dialogOnly = false, onClose, onApplied }: Props) {
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [pendingJob, setPendingJob] = useState<Job | null>(null);
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
  const [employmentType, setEmploymentType] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  function closeApply() { if (!submitting) { setApplyOpen(false); if (dialogOnly) onClose?.(); } }
  const applyDialogRef = useModalFocus<HTMLElement>(applyOpen, closeApply);
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Application | null>(null);
  const submissionKey = useRef(crypto.randomUUID());

  const [sort, setSort] = useState("newest");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(emptyCategoryFilter);
  const [applicationStatus, setApplicationStatus] = useState("");
  const [applicationQuery, setApplicationQuery] = useState("");
  const [applicationSort, setApplicationSort] = useState("newest");
  const jobResults = usePagedResource<Job>(dialogOnly ? null : "/api/v2/candidate/jobs", { q: query, workMode, employmentType: employmentType || undefined, sort, ...categoryFilter }, session.accessToken);
  const applicationResults = usePagedResource<Application>(dialogOnly ? null : "/api/v2/candidate/applications",
    { status: applicationStatus, q: applicationQuery, sort: applicationSort }, session.accessToken, 10);
  const jobs = jobResults.items;

  function startNewSubmission() { submissionKey.current = crypto.randomUUID(); }

  useEffect(() => {
    let active = true;
    const requestedJobId = getPendingJobId() ?? initialJobId;
    void Promise.all([
      apiRequest<Cv[]>("/api/v2/cvs", { accessToken: session.accessToken }),
      requestedJobId ? apiRequest<PageResult<Job>>(`/api/v2/candidate/jobs?page=0&size=1&jobId=${encodeURIComponent(requestedJobId)}`,
        { accessToken: session.accessToken }) : Promise.resolve(null)
    ]).then(([cvResult, requestedJob]) => {
      if (!active) return;
      setCvs(cvResult);
      setCvId(cvResult.find((cv) => cv.activeVersion.processingStatus === "CONFIRMED")?.cvId ?? "");
      if (requestedJob?.items[0]) {
        setPendingJob(requestedJob.items[0]); setJobId(requestedJob.items[0].jobId); setApplyOpen(true);
      } else if (requestedJobId) {
        setMessage("Vị trí bạn chọn hiện không còn tuyển dụng. Bạn có thể xem các cơ hội khác bên dưới.");
      }
      setPendingJobId(null);
    }).catch((requestError) => { if (active) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session.accessToken, initialJobId]);

  useEffect(() => {
    let active = true;
    setApplications(applicationResults.items.map((item) => ({ ...item, matchState: "loading" })));
    void Promise.all(applicationResults.items.map(async (application) => {
      if (application.matchingSupported === false || application.cvAccessGranted === false) return { ...application, match: null };
      try {
        const match = await apiRequest<ApplicationMatch>(`/api/v2/applications/${application.applicationId}/match`, { accessToken: session.accessToken });
        return { ...application, match, matchState: "ready" as const };
      } catch (failure) { return { ...application, match: null, matchState: failure instanceof ApiClientError && failure.status === 404 ? "waiting" as const : "error" as const }; }
    })).then((items) => { if (active) setApplications(items); });
    return () => { active = false; };
  }, [applicationResults.items, session.accessToken]);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedJob || !cvId || !consentAccepted || submitting) return;
    setSubmitting(true); setMessage(null); setError(null);
    try {
      const created = await apiRequest<Application>("/api/v2/candidate/applications", {
        method: "POST", accessToken: session.accessToken,
        idempotencyKey: submissionKey.current,
        body: JSON.stringify({
          jobId: selectedJob?.jobId, cvId,
          cvVersionId: confirmedCvs.find((cv) => cv.cvId === cvId)?.activeVersion.cvVersionId,
          coverLetter: coverLetter.trim() || null,
          consentAccepted, policyVersion: "cv-sharing-v1"
        })
      });
      setApplications((current) => current.some((item) => item.applicationId === created.applicationId)
        ? current
        : [{ ...created, match: null }, ...current]);
      applicationResults.refresh();
      setCoverLetter(""); setConsentAccepted(false); startNewSubmission();
      setApplyOpen(false);
      const success = created.matchingSupported === false
        ? "Đã gửi hồ sơ ứng tuyển. Nhà tuyển dụng sẽ xem hồ sơ thủ công."
        : "Đã gửi hồ sơ ứng tuyển. Kết quả đối chiếu sẽ cập nhật sau khi xử lý.";
      setMessage(success);
      onApplied?.(success);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSubmitting(false); }
  }

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

  async function revoke(application: Application) {
    setWorkingApplicationId(application.applicationId); setError(null);
    try {
      await apiRequest(`/api/v2/candidate/applications/${application.applicationId}/cv-access?version=${application.version}`,
        { method: "DELETE", accessToken: session.accessToken });
      setApplications((current) => current.map((item) => item.applicationId === application.applicationId
        ? { ...item, cvAccessGranted: false, match: null } : item));
      applicationResults.refresh(); setRevokeTarget(null); setMessage("Đã thu hồi quyền xem CV và điểm.");
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setWorkingApplicationId(null); }
  }

  async function withdraw(application: Application, reason: string) {
    setWithdrawTarget(null);
    setWorkingApplicationId(application.applicationId); setMessage(null); setError(null);
    try {
      const updated = await apiRequest<Application>(
        `/api/v2/candidate/applications/${application.applicationId}/withdraw`, {
          method: "POST", accessToken: session.accessToken,
          body: JSON.stringify({ reason, version: application.version })
        });
      setApplications((current) => current.map((item) => item.applicationId === updated.applicationId
        ? { ...item, ...updated }
        : item));
      setMessage("Đã rút hồ sơ ứng tuyển.");
      await loadHistory(application.applicationId);
      applicationResults.refresh();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setWorkingApplicationId(null); }
  }

  if (loading) return <section className={dialogOnly ? "portal-data-message" : "cv-panel"}><p className="muted" role="status">Đang tải thông tin ứng tuyển…</p></section>;
  const confirmedCvs = cvs.filter((cv) => cv.activeVersion.processingStatus === "CONFIRMED");
  const selectedJob = pendingJob ?? jobs.find((job) => job.jobId === jobId) ?? jobs[0];
  const filteredJobs = jobs;
  const applicationDialog = applyOpen && <div className="modal-backdrop" role="presentation"><section ref={applyDialogRef} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="apply-title">
      <div className="section-heading"><div><p className="eyebrow">Ứng tuyển vị trí</p><h2 id="apply-title">{selectedJob?.title}</h2></div><button type="button" className="icon-button secondary-button" aria-label="Đóng" disabled={submitting} onClick={closeApply}>×</button></div>
      <form className="application-form" onSubmit={apply}>
      <label>CV đã xác nhận<select value={cvId} onChange={(event) => { setCvId(event.target.value); startNewSubmission(); }} disabled={!confirmedCvs.length}>{confirmedCvs.length ? confirmedCvs.map((cv) => <option key={cv.cvId} value={cv.cvId}>{cv.title}</option>) : <option value="">Cần xác nhận ParsedCV trước</option>}</select></label>
      <label>Thư ứng tuyển (không bắt buộc)<textarea value={coverLetter} maxLength={5000} rows={5}
        onChange={(event) => { setCoverLetter(event.target.value); startNewSubmission(); }}
        placeholder="Giới thiệu ngắn về sự phù hợp của bạn với vị trí…" /></label>
      <label className="consent-check"><input type="checkbox" checked={consentAccepted} onChange={(event) => { setConsentAccepted(event.target.checked); startNewSubmission(); }} /> Tôi đồng ý chia sẻ CV đã chọn với nhà tuyển dụng của vị trí này để xem xét hồ sơ. Tôi có thể thu hồi quyền xem trong mục đã ứng tuyển.</label>
      {!confirmedCvs.length && <p className="muted">Bạn cần tải lên và xác nhận CV trong mục “CV của tôi” trước khi ứng tuyển.</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <button type="submit" disabled={!confirmedCvs.length || !consentAccepted || submitting}>{submitting ? "Đang gửi…" : "Ứng tuyển"}</button>
      </form></section></div>;
  if (dialogOnly) return <div className="portal-application-layer">
    {applicationDialog}
    {!applyOpen && (message || error) && <div className="portal-data-message" role={error ? "alert" : "status"}>
      {message || error}<button type="button" onClick={onClose}>Đóng</button></div>}
  </div>;
  return <section className="cv-panel candidate-jobs" aria-labelledby="candidate-jobs-title">
    <div className="section-heading"><div><p className="eyebrow">HÀNH TRÌNH NGHỀ NGHIỆP</p><h2 id="candidate-jobs-title">{applicationsOnly ? "Đã ứng tuyển" : "Tìm việc làm"}</h2></div><span>{applicationsOnly ? `${applicationResults.total} hồ sơ` : `${jobResults.total} vị trí`}</span></div>
    {!applicationsOnly && <>
    <JobCategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
    <div className="job-filters"><label>Tìm kiếm<input value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder="Chức danh, kỹ năng hoặc địa điểm" /></label>
      <label>Hình thức<select value={workMode} onChange={(event) => setWorkMode(event.target.value)}><option value="">Tất cả</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option><option value="ONSITE">Tại văn phòng</option></select></label>
      <label>Loại hợp đồng<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)}><option value="">Tất cả</option><option value="FULL_TIME">Toàn thời gian</option><option value="PART_TIME">Bán thời gian</option><option value="CONTRACT">Hợp đồng</option><option value="INTERNSHIP">Thực tập</option></select></label>
      <label>Sắp xếp việc làm<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="title">Tên vị trí A–Z</option></select></label></div>
    <PageControls {...jobResults} onPageChange={(page) => { setPendingJob(null); setJobId(""); jobResults.setPage(page); }} label="Phân trang việc làm" />
    {jobResults.error && <p role="alert">{jobResults.error} <button type="button" onClick={jobResults.refresh}>Thử lại</button></p>}
    {jobs.length === 0 ? <p className="muted">Hiện chưa có Job đang tuyển.</p> : <div className="job-discovery-layout">
      <div className="job-card-list">{filteredJobs.map((job) => <button type="button" key={job.jobId}
        className={`job-card ${job.jobId === jobId ? "selected" : ""}`} onClick={() => { setJobId(job.jobId); setPendingJob(null); setConsentAccepted(false); startNewSubmission(); }}>
        <span>
          <strong>{job.title}</strong>
          <small>{job.locationText ?? "Địa điểm linh hoạt"} · {translateWorkMode(job.workMode)}</small>
          <span className="job-tags">
            {extractSkills(`${job.title} ${job.requirementsText}`).slice(0, 3).map((skill) => (
              <span key={skill} className="tech-badge">{skill}</span>
            ))}
          </span>
        </span>
        <span className="status-pill">{job.employmentType ?? "Toàn thời gian"}</span>
      </button>)}{filteredJobs.length === 0 && <p className="muted">Không có Job phù hợp bộ lọc.</p>}</div>
      {selectedJob && <article className="job-detail-card"><p className="eyebrow">Chi tiết vị trí</p><h3>{selectedJob.title}</h3>
        <div className="job-meta"><span>{selectedJob.locationText ?? "Linh hoạt"}</span><span>{translateWorkMode(selectedJob.workMode)}</span><span>{selectedJob.openings} vị trí</span></div>
        <p>{selectedJob.description}</p><h4>Yêu cầu</h4><p>{selectedJob.requirementsText}</p>
        <button type="button" onClick={() => { startNewSubmission(); setConsentAccepted(false); setApplyOpen(true); }}>Ứng tuyển vị trí này</button></article>}
    </div>}
    </>}
    {applicationDialog}
    {message && <p className="success-message" role="status">{message}</p>}{error && !applyOpen && <p className="error-message" role="alert">{error}</p>}
    <div className="job-filters">
      <label>Tìm hồ sơ đã nộp<input value={applicationQuery} maxLength={200} onChange={(event) => setApplicationQuery(event.target.value)} /></label>
      <label>Trạng thái hồ sơ<select value={applicationStatus} onChange={(event) => setApplicationStatus(event.target.value)}>
        <option value="">Tất cả</option>{["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "REJECTED", "WITHDRAWN"].map((status) => <option key={status} value={status}>{translateApplicationStatus(status)}</option>)}
      </select></label>
      <label>Sắp xếp hồ sơ<select value={applicationSort} onChange={(event) => setApplicationSort(event.target.value)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="score">Mức độ phù hợp</option></select></label>
    </div>
    <PageControls {...applicationResults} onPageChange={applicationResults.setPage} label="Phân trang hồ sơ đã nộp" />
    {applicationResults.error && <p role="alert">{applicationResults.error} <button type="button" onClick={applicationResults.refresh}>Thử lại</button></p>}
    {!applicationResults.loading && !applicationResults.error && applicationResults.total === 0 && <p className="muted">Không có hồ sơ phù hợp bộ lọc.</p>}
    {applications.length > 0 && <div className="application-master-detail candidate-application-history">
      <div className="application-table-wrap"><table className="application-table"><caption>Lịch sử ứng tuyển</caption>
      <thead><tr><th>Vị trí</th><th>Ngày nộp</th><th>Trạng thái</th></tr></thead>
      <tbody>{applications.map((application) => <tr key={application.applicationId} className={(selectedApplicationId ?? applications[0]?.applicationId) === application.applicationId ? "selected" : ""}>
        <td><button type="button" className="text-button" onClick={() => setSelectedApplicationId(application.applicationId)}>{jobs.find((job) => job.jobId === application.jobId)?.title ?? `Hồ sơ ${application.applicationId.slice(0, 8)}`}</button></td>
        <td>{new Date(application.appliedAt).toLocaleDateString("vi-VN")}</td><td>{translateApplicationStatus(application.status)}</td>
      </tr>)}</tbody></table></div>
      <div className="application-selected-panel" aria-label="Chi tiết hồ sơ đã nộp">
      {applications.filter((item) => item.applicationId === (applications.find((row) => row.applicationId === selectedApplicationId)?.applicationId ?? applications[0]?.applicationId)).map((application) => <article className="application-detail" key={application.applicationId}>
      <div className="application-item"><span>{jobs.find((job) => job.jobId === application.jobId)?.title ?? application.jobId}<small>{new Date(application.appliedAt).toLocaleString()}</small></span><span className="status-pill">{translateApplicationStatus(application.status)}</span></div>
      {application.match ? <MatchBreakdown match={application.match} /> : <p className="muted">{application.cvAccessGranted === false ? "Quyền xem CV và điểm đã được thu hồi." : application.matchingSupported === false ? "Ngành này chưa hỗ trợ AI; nhà tuyển dụng sẽ xem xét hồ sơ thủ công." : matchSummary(application)}</p>}
      {application.matchState === "error" && <p role="alert">Không tải được điểm. <button type="button" onClick={applicationResults.refresh}>Thử lại điểm</button></p>}
      <div className="button-row">
        <button className="secondary-button" type="button" disabled={workingApplicationId === application.applicationId}
          onClick={() => void loadHistory(application.applicationId)}>
          {workingApplicationId === application.applicationId ? "Đang tải…" : "Xem tiến trình"}
        </button>
        {application.cvAccessGranted !== false && application.status !== "WITHDRAWN" && <button className="danger-button" type="button"
          disabled={workingApplicationId !== null} onClick={() => setRevokeTarget(application)}>Thu hồi quyền xem CV</button>}
        {["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED"].includes(application.status) && <button className="danger-button" type="button"
          disabled={workingApplicationId === application.applicationId} onClick={() => setWithdrawTarget(application)}>Rút hồ sơ</button>}
      </div>
      {histories[application.applicationId] && <ol className="status-timeline">
        {histories[application.applicationId].map((change) => <li key={change.statusChangeId}>
          <strong>{translateApplicationStatus(change.toStatus)}</strong><span>{new Date(change.occurredAt).toLocaleString()}</span>
          {change.reason && <small>Lý do: {change.reason}</small>}
        </li>)}
      </ol>}
    </article>)}</div></div>}
    <ReasonDialog open={withdrawTarget !== null} title="Rút hồ sơ ứng tuyển" confirmLabel="Xác nhận rút hồ sơ"
      description="Rút hồ sơ và thu hồi quyền xem CV, điểm của nhà tuyển dụng. Lịch sử ứng tuyển được giữ lại; thao tác không thể hoàn tác."
      onCancel={() => setWithdrawTarget(null)} onConfirm={(reason) => { if (withdrawTarget) void withdraw(withdrawTarget, reason); }} />
    <ConfirmDialog open={revokeTarget !== null} title="Thu hồi quyền xem CV" confirmLabel="Xác nhận thu hồi"
      busy={workingApplicationId !== null} description="Nhà tuyển dụng sẽ không xem được CV hoặc điểm của hồ sơ này. Trạng thái và lịch sử ứng tuyển vẫn được giữ lại."
      onCancel={() => setRevokeTarget(null)} onConfirm={() => { if (revokeTarget) void revoke(revokeTarget); }} />
  </section>;
}

function translateWorkMode(value: string | null): string {
  return ({ REMOTE: "Remote", HYBRID: "Hybrid", ONSITE: "Tại văn phòng" } as Record<string, string>)[value ?? ""] ?? "Linh hoạt";
}

function translateApplicationStatus(status: string): string {
  return ({ SUBMITTED: "Mới ứng tuyển", UNDER_REVIEW: "Đang xem xét", SHORTLISTED: "Danh sách rút gọn", REJECTED: "Đã từ chối", WITHDRAWN: "Đã rút" } as Record<string, string>)[status] ?? status;
}

function getErrorMessage(error: unknown): string { return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại."; }

const commonTechs = ["Java", "Kafka", "Spring Boot", "React", "Python", "Docker", "PostgreSQL", "AWS", "TypeScript", "Node.js", "AI", "Go", "SQL"];
function extractSkills(text: string): string[] {
  return commonTechs.filter((tech) => new RegExp(`\\b${tech}\\b`, "i").test(text));
}
