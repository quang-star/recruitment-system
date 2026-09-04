import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { RecruiterApplicationsPanel } from "./RecruiterApplicationsPanel";

type Job = {
  jobId: string;
  companyId: string;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  version: number;
  jobVersionId: string;
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
  sourceHash: string;
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

type ParsedJd = {
  revisionId: string;
  jobId: string;
  jobVersionId: string;
  revisionNumber: number;
  sourceHash: string;
  status: "PARSED" | "CONFIRMED" | "SUPERSEDED";
  payload: {
    [key: string]: unknown;
    document: { jobVersionId: string; language: string; sourceHash: string; parserVersion: string };
    title: { raw: string; canonicalFamily: string | null; level: string | null; confidence: number; evidenceIds: string[] };
    requirements: {
      requiredSkills: JdSkill[];
      preferredSkills: JdSkill[];
      minimumRelevantExperienceMonths: number | null;
      education: Array<Record<string, unknown>>;
      languages: Array<Record<string, unknown>>;
    };
    responsibilities: Array<Record<string, unknown> & { raw: string }>;
    overallConfidence: number;
    qualityFlags: string[];
  };
  confirmedBy: string | null;
  confirmedAt: string | null;
  version: number;
};

type JdSkill = {
  raw: string;
  canonicalSkillId: string | null;
  normalizationStatus: "KNOWN" | "PENDING" | "UNRESOLVED";
  criticality: "CRITICAL" | "NORMAL";
  minimumMonths: number | null;
  evidenceIds: string[];
  confidence: number;
  confirmedByRecruiter: boolean;
};

const emptyJob: JobForm = {
  title: "", description: "", requirementsText: "", benefitsText: "", locationText: "",
  countryCode: "VN", workMode: "", employmentType: "FULL_TIME", seniorityLevel: "",
  openings: 1, salaryMin: "", salaryMax: "", salaryCurrency: "VND", salaryPeriod: "MONTH",
  salaryNegotiable: false, applicationDeadline: ""
};

export function RecruiterJobBoard({ session, companyId, canRecruit }: {
  session: AuthSession; companyId: string | null; canRecruit: boolean;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedJd, setParsedJd] = useState<ParsedJd | null>(null);
  const [parsedJdDraft, setParsedJdDraft] = useState<ParsedJd["payload"] | null>(null);
  const [loadingParsedJd, setLoadingParsedJd] = useState(false);
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

  useEffect(() => {
    let active = true;
    const selected = jobs.find((job) => job.jobId === selectedJobId);
    if (!selected) {
      setParsedJd(null);
      setParsedJdDraft(null);
      return () => { active = false; };
    }
    setLoadingParsedJd(true);
    void (async () => {
      for (let attempt = 0; attempt < 8 && active; attempt += 1) {
        try {
          const result = await apiRequest<ParsedJd>(`/api/v1/parsed-jds/${selected.jobVersionId}`, {
            accessToken: session.accessToken
          });
          if (active) { setParsedJd(result); setParsedJdDraft(structuredClone(result.payload)); }
          return;
        } catch (requestError) {
          const pending = requestError instanceof ApiClientError && requestError.status === 404;
          if (!pending) { if (active) setError(getErrorMessage(requestError)); return; }
          if (attempt < 7) await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
      if (active) { setParsedJd(null); setParsedJdDraft(null); }
    })().finally(() => { if (active) setLoadingParsedJd(false); });
    return () => { active = false; };
  }, [jobs, selectedJobId, session.accessToken]);

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
      setSelectedJobId(saved.jobId); setForm(toForm(saved));
      setParsedJd(null); setParsedJdDraft(null);
      setMessage(selectedJobId
        ? "JD đã được cập nhật; yêu cầu parse đã được đưa vào hàng đợi."
        : "JD nháp đã được tạo; yêu cầu parse đã được đưa vào hàng đợi.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function changeState(job: Job, action: "publish" | "close") {
    setMessage(null); setError(null);
    if (action === "publish" && parsedJd?.status !== "CONFIRMED") {
      setError("Cần review và xác nhận ParsedJD trước khi đăng JD.");
      return;
    }
    try {
      const updated = await apiRequest<Job>(`/api/v1/jobs/${job.jobId}/${action}?version=${job.version}`, { method: "POST", accessToken: session.accessToken });
      setJobs((current) => current.map((item) => item.jobId === updated.jobId ? updated : item));
      selectJob(updated); setMessage(action === "publish" ? "JD đã được đăng." : "JD đã được đóng.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function confirmParsedJd() {
    if (!parsedJd) return;
    setMessage(null); setError(null);
    try {
      const confirmed = await apiRequest<ParsedJd>(`/api/v1/parsed-jds/${parsedJd.jobVersionId}/confirm`, {
        method: "POST", accessToken: session.accessToken,
        body: JSON.stringify({ expectedRevisionId: parsedJd.revisionId })
      });
      setParsedJd(confirmed);
      setParsedJdDraft(structuredClone(confirmed.payload));
      setMessage("ParsedJD đã được xác nhận. Có thể đăng JD sau khi Core nhận event.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function saveParsedJd() {
    if (!parsedJd || !parsedJdDraft) return;
    const allSkills = [...parsedJdDraft.requirements.requiredSkills, ...parsedJdDraft.requirements.preferredSkills];
    if (allSkills.some((skill) => !skill.raw.trim())) {
      setError("Kỹ năng trong ParsedJD không được để trống.");
      return;
    }
    setSaving(true); setMessage(null); setError(null);
    try {
      const updated = await apiRequest<ParsedJd>(`/api/v1/parsed-jds/${parsedJd.jobVersionId}`, {
        method: "PATCH", accessToken: session.accessToken,
        body: JSON.stringify({ expectedRevisionId: parsedJd.revisionId, payload: parsedJdDraft })
      });
      setParsedJd(updated);
      setParsedJdDraft(structuredClone(updated.payload));
      setMessage("Đã lưu ParsedJD revision mới. Kiểm tra lại rồi xác nhận.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSaving(false); }
  }

  function updateJdSkill(section: "requiredSkills" | "preferredSkills", index: number, raw: string) {
    if (!parsedJdDraft) return;
    setParsedJdDraft({ ...parsedJdDraft, requirements: { ...parsedJdDraft.requirements,
      [section]: parsedJdDraft.requirements[section].map((skill, itemIndex) => itemIndex === index
        ? { ...skill, raw }
        : skill)
    } });
  }

  function addJdSkill(section: "requiredSkills" | "preferredSkills") {
    if (!parsedJdDraft) return;
    const skill: JdSkill = { raw: "", canonicalSkillId: null, normalizationStatus: "UNRESOLVED",
      criticality: section === "requiredSkills" ? "CRITICAL" : "NORMAL", minimumMonths: null,
      evidenceIds: [], confidence: 1, confirmedByRecruiter: true };
    setParsedJdDraft({ ...parsedJdDraft, requirements: { ...parsedJdDraft.requirements,
      [section]: [...parsedJdDraft.requirements[section], skill]
    } });
  }

  function removeJdSkill(section: "requiredSkills" | "preferredSkills", index: number) {
    if (!parsedJdDraft) return;
    setParsedJdDraft({ ...parsedJdDraft, requirements: { ...parsedJdDraft.requirements,
      [section]: parsedJdDraft.requirements[section].filter((_, itemIndex) => itemIndex !== index)
    } });
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
    {canRecruit && <button className="secondary-button" type="button" onClick={newJob}>+ Tạo JD mới</button>}
    <form className="job-form" onSubmit={save}>
      <fieldset className="permission-fieldset" disabled={!canRecruit}>
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
      <div className="parsed-jd-review">
        <div className="section-heading"><div><p className="eyebrow">AI review</p><h3>ParsedJD</h3></div><span className="status-pill">{loadingParsedJd ? "Đang parse…" : parsedJd?.status ?? "Chưa có"}</span></div>
        {parsedJd && parsedJdDraft && <>
          <p className="muted">Revision v{parsedJd.revisionNumber} · family {parsedJdDraft.title.canonicalFamily ?? "OTHER"} · level {parsedJdDraft.title.level ?? "—"}</p>
          {(["requiredSkills", "preferredSkills"] as const).map((section) => <div className="parsed-section" key={section}>
            <div className="parsed-section-heading"><strong>{section === "requiredSkills" ? "Kỹ năng bắt buộc" : "Kỹ năng ưu tiên"}</strong>
              <button className="secondary-button" type="button" disabled={parsedJd.status === "CONFIRMED"}
                onClick={() => addJdSkill(section)}>Thêm</button></div>
            {parsedJdDraft.requirements[section].map((skill, index) => <div className="parsed-row" key={`${section}-${index}`}>
              <input value={skill.raw} disabled={parsedJd.status === "CONFIRMED"}
                aria-label={`${section === "requiredSkills" ? "Kỹ năng bắt buộc" : "Kỹ năng ưu tiên"} ${index + 1}`}
                onChange={(event) => updateJdSkill(section, index, event.target.value)} />
              <button className="danger-button" type="button" disabled={parsedJd.status === "CONFIRMED"}
                onClick={() => removeJdSkill(section, index)}>Xóa</button>
            </div>)}
            {parsedJdDraft.requirements[section].length === 0 && <p className="muted">Không có.</p>}
          </div>)}
          <label>Kinh nghiệm liên quan tối thiểu (tháng)<input type="number" min={0}
            disabled={parsedJd.status === "CONFIRMED"}
            value={parsedJdDraft.requirements.minimumRelevantExperienceMonths ?? ""}
            onChange={(event) => setParsedJdDraft({ ...parsedJdDraft, requirements: { ...parsedJdDraft.requirements,
              minimumRelevantExperienceMonths: event.target.value === "" ? null : Math.max(0, Number(event.target.value))
            } })} /></label>
          {parsedJdDraft.qualityFlags.length > 0 && <p className="muted">Cờ chất lượng: {parsedJdDraft.qualityFlags.join(", ")}</p>}
          {parsedJd.status === "PARSED" && <div className="button-row"><button className="secondary-button" type="button"
            disabled={saving} onClick={() => void saveParsedJd()}>Lưu revision ParsedJD</button>
            <button type="button" disabled={saving} onClick={() => void confirmParsedJd()}>Xác nhận ParsedJD</button></div>}
        </>}
        {!parsedJd && !loadingParsedJd && <p className="muted">Lưu JD để AI tạo bản parse review.</p>}
      </div>
      {message && <p className="success-message" role="status">{message}</p>}{error && <p className="error-message" role="alert">{error}</p>}
      <div className="button-row"><button type="submit" disabled={saving}>{saving ? "Đang lưu…" : selectedJobId ? "Lưu JD" : "Tạo bản nháp"}</button>{selectedJobId && jobs.find((job) => job.jobId === selectedJobId)?.status === "DRAFT" && <button className="secondary-button" type="button" onClick={() => { const job = jobs.find((item) => item.jobId === selectedJobId); if (job) void changeState(job, "publish"); }}>Đăng JD</button>}{selectedJobId && jobs.find((job) => job.jobId === selectedJobId)?.status === "PUBLISHED" && <button className="secondary-button" type="button" onClick={() => { const job = jobs.find((item) => item.jobId === selectedJobId); if (job) void changeState(job, "close"); }}>Đóng JD</button>}</div>
      </fieldset>
    </form>
    {!canRecruit && <p className="muted">Bạn có quyền xem JD và pipeline, nhưng không thể sửa hoặc chuyển trạng thái.</p>}
    <RecruiterApplicationsPanel session={session} jobId={selectedJobId} canTransition={canRecruit} />
  </div>;
}

function toForm(job: Job): JobForm { return { title: job.title, description: job.description, requirementsText: job.requirementsText, benefitsText: job.benefitsText ?? "", locationText: job.locationText ?? "", countryCode: job.countryCode ?? "VN", workMode: job.workMode ?? "", employmentType: job.employmentType ?? "FULL_TIME", seniorityLevel: job.seniorityLevel ?? "", openings: job.openings, salaryMin: job.salaryMin?.toString() ?? "", salaryMax: job.salaryMax?.toString() ?? "", salaryCurrency: job.salaryCurrency ?? "VND", salaryPeriod: job.salaryPeriod ?? "MONTH", salaryNegotiable: job.salaryNegotiable, applicationDeadline: job.applicationDeadline ? job.applicationDeadline.slice(0, 16) : "" }; }
function getErrorMessage(error: unknown): string { return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại."; }
