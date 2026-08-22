import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

type Job = {
  jobId: string;
  companyId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  version: number;
  jobVersionNumber: number;
  title: string;
  description: string;
  requirementsText: string;
  benefitsText: string | null;
  locationText: string | null;
  countryCode: string | null;
  workMode: "ONSITE" | "HYBRID" | "REMOTE" | null;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | null;
  seniorityLevel: string | null;
  openings: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryNegotiable: boolean;
  applicationDeadline: string | null;
};

type JobForm = {
  title: string;
  description: string;
  requirementsText: string;
  benefitsText: string;
  locationText: string;
  countryCode: string;
  workMode: string;
  employmentType: string;
  seniorityLevel: string;
  openings: number;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  salaryPeriod: string;
  salaryNegotiable: boolean;
  applicationDeadline: string;
};

const emptyJob: JobForm = {
  title: "", description: "", requirementsText: "", benefitsText: "", locationText: "",
  countryCode: "VN", workMode: "", employmentType: "FULL_TIME", seniorityLevel: "",
  openings: 1, salaryMin: "", salaryMax: "", salaryCurrency: "VND", salaryPeriod: "MONTH",
  salaryNegotiable: false, applicationDeadline: ""
};

export function RecruiterJobBoard({ session, companyId }: { session: AuthSession; companyId: string | null }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSelectedJobId(null);
    setForm(emptyJob);
    if (!companyId) { setJobs([]); return () => { active = false; }; }
    setLoading(true);
    void apiRequest<Job[]>(`/api/v1/companies/${companyId}/jobs`, { accessToken: session.accessToken })
      .then((result) => { if (active) setJobs(result); })
      .catch((requestError) => { if (active && (!(requestError instanceof ApiClientError) || requestError.status !== 404)) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, session.accessToken]);

  function selectJob(job: Job) { setSelectedJobId(job.jobId); setForm(toForm(job)); setMessage(null); setError(null); }
  function newJob() { setSelectedJobId(null); setForm(emptyJob); setMessage(null); setError(null); }
  function updateForm<K extends keyof JobForm>(key: K, value: JobForm[K]) { setForm((current) => ({ ...current, [key]: value })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || saving) return;
    setSaving(true); setMessage(null); setError(null);
    const payload = {
      ...form,
      benefitsText: form.benefitsText || null,
      locationText: form.locationText || null,
      countryCode: form.countryCode || null,
      workMode: form.workMode || null,
      employmentType: form.employmentType || null,
      seniorityLevel: form.seniorityLevel || null,
      salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
      salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
      salaryCurrency: form.salaryMin || form.salaryMax ? form.salaryCurrency : null,
      salaryPeriod: form.salaryMin || form.salaryMax ? form.salaryPeriod : null,
      applicationDeadline: form.applicationDeadline ? new Date(form.applicationDeadline).toISOString() : null,
      ...(selectedJobId ? { version: jobs.find((job) => job.jobId === selectedJobId)?.version } : {})
    };
    try {
      const saved = await apiRequest<Job>(selectedJobId ? `/api/v1/jobs/${selectedJobId}` : `/api/v1/companies/${companyId}/jobs`, {
        method: selectedJobId ? "PUT" : "POST", accessToken: session.accessToken, body: JSON.stringify(payload)
      });
      setJobs((current) => selectedJobId ? current.map((job) => job.jobId === saved.jobId ? saved : job) : [saved, ...current]);
      setSelectedJobId(saved.jobId); setForm(toForm(saved)); setMessage(selectedJobId ? "JD đã được cập nhật." : "JD nháp đã được tạo.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function changeState(job: Job, action: "publish" | "close") {
    setMessage(null); setError(null);
    try {
      const updated = await apiRequest<Job>(`/api/v1/jobs/${job.jobId}/${action}?version=${job.version}`, { method: "POST", accessToken: session.accessToken });
      setJobs((current) => current.map((item) => item.jobId === updated.jobId ? updated : item));
      selectJob(updated); setMessage(action === "publish" ? "JD đã được đăng." : "JD đã được đóng.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  if (!companyId) return null;
  return <div className="workspace-panel job-board">
    <div className="section-heading"><div><p className="eyebrow">Job descriptions</p><h3>JD của công ty</h3></div><span>{jobs.length} JD</span></div>
    {loading ? <p className="muted">Đang tải JD…</p> : <div className="job-list">
      {jobs.map((job) => <button key={job.jobId} type="button" className={`company-option ${job.jobId === selectedJobId ? "selected" : ""}`} onClick={() => selectJob(job)}>
        <span><strong>{job.title}</strong><small>v{job.jobVersionNumber} · {job.status}</small></span><span className="status-pill">{job.openings} vị trí</span>
      </button>)}
      {jobs.length === 0 && <p className="muted">Chưa có JD. Tạo bản nháp đầu tiên.</p>}
    </div>}
    <button className="secondary-button" type="button" onClick={newJob}>+ Tạo JD mới</button>
    <form className="job-form" onSubmit={save}>
      <div className="form-grid"><label>Tiêu đề<input required maxLength={240} value={form.title} onChange={(e) => updateForm("title", e.target.value)} /></label>
        <label>Địa điểm<input maxLength={300} value={form.locationText} onChange={(e) => updateForm("locationText", e.target.value)} /></label>
        <label>Quốc gia<input pattern="[A-Z]{2}" maxLength={2} value={form.countryCode} onChange={(e) => updateForm("countryCode", e.target.value.toUpperCase())} /></label>
        <label>Hình thức<select value={form.workMode} onChange={(e) => updateForm("workMode", e.target.value)}><option value="">Chọn</option><option>ONSITE</option><option>HYBRID</option><option>REMOTE</option></select></label>
        <label>Loại hợp đồng<select value={form.employmentType} onChange={(e) => updateForm("employmentType", e.target.value)}><option>FULL_TIME</option><option>PART_TIME</option><option>CONTRACT</option><option>INTERNSHIP</option></select></label>
        <label>Cấp độ<input maxLength={30} value={form.seniorityLevel} onChange={(e) => updateForm("seniorityLevel", e.target.value)} /></label>
        <label>Số vị trí<input type="number" min={1} required value={form.openings} onChange={(e) => updateForm("openings", Number(e.target.value))} /></label>
        <label>Hạn nhận hồ sơ<input type="datetime-local" value={form.applicationDeadline} onChange={(e) => updateForm("applicationDeadline", e.target.value)} /></label>
      </div>
      <label>Mô tả công việc<textarea required rows={5} value={form.description} onChange={(e) => updateForm("description", e.target.value)} /></label>
      <label>Yêu cầu<textarea required rows={5} value={form.requirementsText} onChange={(e) => updateForm("requirementsText", e.target.value)} /></label>
      <label>Quyền lợi<textarea rows={3} value={form.benefitsText} onChange={(e) => updateForm("benefitsText", e.target.value)} /></label>
      <div className="form-grid"><label>Lương tối thiểu<input type="number" min={0} value={form.salaryMin} onChange={(e) => updateForm("salaryMin", e.target.value)} /></label><label>Lương tối đa<input type="number" min={0} value={form.salaryMax} onChange={(e) => updateForm("salaryMax", e.target.value)} /></label><label>Tiền tệ<input maxLength={3} value={form.salaryCurrency} onChange={(e) => updateForm("salaryCurrency", e.target.value.toUpperCase())} /></label><label>Kỳ lương<select value={form.salaryPeriod} onChange={(e) => updateForm("salaryPeriod", e.target.value)}><option>HOUR</option><option>MONTH</option><option>YEAR</option></select></label></div>
      {message && <p className="success-message" role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
      <div className="button-row"><button type="submit" disabled={saving}>{saving ? "Đang lưu…" : selectedJobId ? "Lưu JD" : "Tạo bản nháp"}</button>{selectedJobId && jobs.find((job) => job.jobId === selectedJobId)?.status === "DRAFT" && <button className="secondary-button" type="button" onClick={() => { const job = jobs.find((item) => item.jobId === selectedJobId); if (job) void changeState(job, "publish"); }}>Đăng JD</button>}{selectedJobId && jobs.find((job) => job.jobId === selectedJobId)?.status === "PUBLISHED" && <button className="secondary-button" type="button" onClick={() => { const job = jobs.find((item) => item.jobId === selectedJobId); if (job) void changeState(job, "close"); }}>Đóng JD</button>}</div>
    </form>
  </div>;
}

function toForm(job: Job): JobForm { return { title: job.title, description: job.description, requirementsText: job.requirementsText, benefitsText: job.benefitsText ?? "", locationText: job.locationText ?? "", countryCode: job.countryCode ?? "VN", workMode: job.workMode ?? "", employmentType: job.employmentType ?? "FULL_TIME", seniorityLevel: job.seniorityLevel ?? "", openings: job.openings, salaryMin: job.salaryMin?.toString() ?? "", salaryMax: job.salaryMax?.toString() ?? "", salaryCurrency: job.salaryCurrency ?? "VND", salaryPeriod: job.salaryPeriod ?? "MONTH", salaryNegotiable: job.salaryNegotiable, applicationDeadline: job.applicationDeadline ? job.applicationDeadline.slice(0, 16) : "" }; }
function getErrorMessage(error: unknown): string { return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại."; }
