import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

type Job = { jobId: string; title: string; description: string; requirementsText: string; locationText: string | null; workMode: string | null; employmentType: string | null; openings: number; companyId: string; };
type Cv = { cvId: string; title: string; activeVersion: { cvVersionId: string; processingStatus: string; }; };
type ApplicationMatch = { status: string; finalScore: number; qualityFlags: string; };
type Application = { applicationId: string; jobId: string; status: string; appliedAt: string; match?: ApplicationMatch | null; };

export function CandidateJobsPanel({ session }: { session: AuthSession }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobId, setJobId] = useState("");
  const [cvId, setCvId] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ jobId, cvId, consentAccepted, policyVersion: "cv-sharing-v1" })
      });
      setApplications((current) => [{ ...created, match: null }, ...current]); setMessage("Đã gửi hồ sơ ứng tuyển. Matching sẽ cập nhật bất đồng bộ.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSubmitting(false); }
  }

  if (loading) return <section className="cv-panel"><p className="muted">Đang tải Job và hồ sơ ứng tuyển…</p></section>;
  const confirmedCvs = cvs.filter((cv) => cv.activeVersion.processingStatus === "CONFIRMED");
  return <section className="cv-panel candidate-jobs" aria-labelledby="candidate-jobs-title">
    <div className="section-heading"><div><p className="eyebrow">Open positions</p><h2 id="candidate-jobs-title">Job đang tuyển</h2></div><span>{jobs.length} Job</span></div>
    {jobs.length === 0 ? <p className="muted">Hiện chưa có Job đang tuyển.</p> : <form className="application-form" onSubmit={apply}>
      <label>Job<select value={jobId} onChange={(event) => setJobId(event.target.value)}>{jobs.map((job) => <option key={job.jobId} value={job.jobId}>{job.title} · {job.locationText ?? "Linh hoạt"}</option>)}</select></label>
      <label>CV đã xác nhận<select value={cvId} onChange={(event) => setCvId(event.target.value)} disabled={!confirmedCvs.length}>{confirmedCvs.length ? confirmedCvs.map((cv) => <option key={cv.cvId} value={cv.cvId}>{cv.title}</option>) : <option value="">Cần xác nhận ParsedCV trước</option>}</select></label>
      <label className="consent-check"><input type="checkbox" checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} /> Cho phép recruiter xem CV này cho application (policy cv-sharing-v1)</label>
      <button type="submit" disabled={!confirmedCvs.length || !consentAccepted || submitting}>{submitting ? "Đang gửi…" : "Ứng tuyển"}</button>
    </form>}
    {message && <p className="success-message" role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    {applications.length > 0 && <div className="application-list"><h3>Lịch sử ứng tuyển</h3>{applications.map((application) => <div className="application-item" key={application.applicationId}><span>{jobs.find((job) => job.jobId === application.jobId)?.title ?? application.jobId}</span><span className="status-pill">{application.status}</span>{application.match && <span className="match-score">{application.match.status} · {application.match.finalScore.toFixed(1)}/100</span>}</div>)}</div>}
  </section>;
}

function getErrorMessage(error: unknown): string { return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại."; }
