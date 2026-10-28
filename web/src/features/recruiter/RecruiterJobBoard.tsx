import { DocumentReview } from "../../shared/components/DocumentReview";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { CategoryChoice, defaultCategory, itIndustryId, JobCategoryFields } from "./JobCategoryFields";
import { CategoryFilterValue, emptyCategoryFilter, JobCategoryFilter } from "./JobCategoryFilter";
import { CareerCategorySuggestions } from "./CareerCategorySuggestions";
import { ExternalAiConsent, externalAiPolicyVersion, extractionNeedsManualReview, visibleQualityFlags } from "../../shared/components/ExternalAiConsent";
import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { usePagedResource } from "../../shared/api/pagination";
import { PageControls } from "../../shared/components/PageControls";
import { AuthSession } from "../../shared/auth/session";
import { RecruiterApplicationsPanel } from "./RecruiterApplicationsPanel";
import { SearchIcon, SparklesIcon, CheckCircleIcon } from "../../shared/components/Icon";

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
  externalAiConsent?: boolean;
  externalAiPolicyVersion?: string | null;
  sourceHash: string;
  category?: CategoryChoice;
  matchingSupported?: boolean;
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
  externalAiConsent: boolean;
  category: CategoryChoice;
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
  salaryNegotiable: false, applicationDeadline: "", externalAiConsent: false, category: defaultCategory
};

export function RecruiterJobBoard({ session, companyId, canRecruit, initialJobId }: {
  session: AuthSession; companyId: string | null; canRecruit: boolean; initialJobId?: string | null;
}) {
  const [selectedRecord, setSelectedRecord] = useState<Job | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId ?? null);
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [saving, setSaving] = useState(false);
  const [parsedJd, setParsedJd] = useState<ParsedJd | null>(null);
  const [parsedJdDraft, setParsedJdDraft] = useState<ParsedJd["payload"] | null>(null);
  const [loadingParsedJd, setLoadingParsedJd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ATS UX Enhancements
  const [viewMode, setViewMode] = useState<"list" | "workspace">(initialJobId ? "workspace" : "list");
  const [activeTab, setActiveTab] = useState<"pipeline" | "editor" | "review" | "analytics">(initialJobId ? "pipeline" : "editor");
  const [jobSearch, setJobSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const [sort, setSort] = useState("newest");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(emptyCategoryFilter);
  const results = usePagedResource<Job>(companyId ? `/api/v2/companies/${companyId}/jobs` : null,
    { q: jobSearch, status: statusFilter === "ALL" ? "" : statusFilter, sort, ...categoryFilter }, session.accessToken);
  const jobs = results.items;
  const loading = results.loading;

  useEffect(() => {
    setSelectedJobId(null); setSelectedRecord(null);
    setForm(emptyJob); setActiveTab("editor");
    setViewMode("list");
  }, [companyId]);

  useEffect(() => {
    if (initialJobId && jobs.length > 0) {
      const target = jobs.find((j) => j.jobId === initialJobId);
      if (target) {
        setSelectedJobId(target.jobId);
        setSelectedRecord(target);
        setForm(toForm(target));
        setActiveTab("pipeline");
        setViewMode("workspace");
      }
    }
  }, [initialJobId, jobs]);

  useEffect(() => {
    let active = true;
    const selected = selectedRecord;
    if (!selected || selected.matchingSupported === false) {
      setParsedJd(null);
      setParsedJdDraft(null);
      return () => { active = false; };
    }
    setLoadingParsedJd(true);
    void (async () => {
      for (let attempt = 0; attempt < 8 && active; attempt += 1) {
        try {
          const result = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${selected.jobVersionId}`, {
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
  }, [selectedRecord, session.userId]);

  const reviewDirty = !!parsedJd && !!parsedJdDraft && JSON.stringify(parsedJdDraft) !== JSON.stringify(parsedJd.payload);
  const formDirty = JSON.stringify(form) !== JSON.stringify(selectedRecord ? toForm(selectedRecord) : emptyJob);
  useUnsavedChanges(reviewDirty || formDirty, () => setError("Bạn còn thay đổi chưa lưu. Hãy lưu trước khi chuyển màn hình."));
  function canLeaveDraft() {
    if (reviewDirty || formDirty || saving) { setError("Bạn còn thay đổi chưa lưu hoặc đang xử lý. Hãy lưu trước khi đổi tin tuyển dụng."); return false; }
    return true;
  }

  function selectJob(job: Job, targetTab: "pipeline" | "editor" | "review" | "analytics" = "pipeline") {
    if (!canLeaveDraft()) return;
    setSelectedJobId(job.jobId); setSelectedRecord(job);
    setForm(toForm(job));
    setActiveTab(targetTab);
    setViewMode("workspace");
    setMessage(null);
    setError(null);
  }

  function newJob() {
    if (!canLeaveDraft()) return;
    setSelectedJobId(null); setSelectedRecord(null);
    setForm(emptyJob);
    setActiveTab("editor");
    setViewMode("workspace");
    setMessage(null);
    setError(null);
  }

  function backToList() {
    if (!canLeaveDraft()) return;
    setViewMode("list");
    setSelectedJobId(null);
    setSelectedRecord(null);
    setMessage(null);
    setError(null);
  }

  function updateForm<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || saving) return;
    setSaving(true); setMessage(null); setError(null);
    const payload = {
      ...form,
      category: { ...form.category, positionName: form.category.positionName || form.title },
      benefitsText: form.benefitsText || null,
      locationText: form.locationText || null,
      externalAiPolicyVersion: form.externalAiConsent ? externalAiPolicyVersion : null,
      countryCode: form.countryCode || null,
      workMode: form.workMode || null,
      employmentType: form.employmentType || null,
      seniorityLevel: form.seniorityLevel || null,
      salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
      salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
      salaryCurrency: form.salaryMin || form.salaryMax ? form.salaryCurrency : null,
      salaryPeriod: form.salaryMin || form.salaryMax ? form.salaryPeriod : null,
      applicationDeadline: form.applicationDeadline ? new Date(form.applicationDeadline).toISOString() : null,
      ...(selectedJobId ? { version: selectedRecord?.version } : {})
    };
    try {
      const saved = await apiRequest<Job>(selectedJobId ? `/api/v2/jobs/${selectedJobId}` : `/api/v2/companies/${companyId}/jobs`, {
        method: selectedJobId ? "PUT" : "POST", accessToken: session.accessToken, body: JSON.stringify(payload)
      });
      setSelectedRecord(saved); results.refresh();
      setSelectedJobId(saved.jobId);
      setForm(toForm(saved));
      setActiveTab("editor");
      setViewMode("workspace");
      setParsedJd(null); setParsedJdDraft(null);
      setMessage(saved.matchingSupported === false ? "Đã lưu tin. Ngành này chưa hỗ trợ AI; có thể đăng tin và tuyển dụng thủ công." : selectedJobId
        ? "JD đã được cập nhật; yêu cầu parse đã được đưa vào hàng đợi."
        : "JD nháp đã được tạo; yêu cầu parse đã được đưa vào hàng đợi.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSaving(false); }
  }

  async function changeState(job: Job, action: "publish" | "close") {
    setMessage(null); setError(null);
    if (saving || formDirty || reviewDirty) { setError("Hãy lưu các thay đổi trước khi đăng hoặc đóng tin."); return; }
    if (action === "publish" && job.matchingSupported !== false && parsedJd?.status !== "CONFIRMED") {
      setError("Cần review và xác nhận ParsedJD trước khi đăng JD.");
      return;
    }
    try {
      const updated = await apiRequest<Job>(`/api/v2/jobs/${job.jobId}/${action}?version=${job.version}`, { method: "POST", accessToken: session.accessToken });
      setSelectedRecord(updated); results.refresh();
      setSelectedJobId(updated.jobId);
      setForm(toForm(updated));
      setMessage(action === "publish" ? "JD đã được đăng." : "JD đã được đóng.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function confirmParsedJd() {
    if (!parsedJd || reviewDirty || saving) return;
    setSaving(true); setMessage(null); setError(null);
    try {
      const confirmed = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${parsedJd.jobVersionId}/confirm`, {
        method: "POST", accessToken: session.accessToken,
        body: JSON.stringify({ expectedRevisionId: parsedJd.revisionId })
      });
      setParsedJd(confirmed);
      setParsedJdDraft(structuredClone(confirmed.payload));
      setMessage("Đã xác nhận yêu cầu tuyển dụng. Trạng thái đăng tin sẽ cập nhật sau khi xử lý.");
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setSaving(false); }
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
      const updated = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${parsedJd.jobVersionId}`, {
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

  const filteredJobs = jobs;
  const selectedJob = selectedRecord;

  return (
    <div className="ats-job-workspace">
      {/* --- TOP ATS TOOLBAR (Displayed on Job Board list view) --- */}
      {viewMode === "list" && (
        <header className="ats-toolbar">
          <div className="ats-toolbar-info">
            <h2>Quản lý Tin tuyển dụng &amp; ATS</h2>
            <p>Theo dõi trạng thái các vị trí tuyển dụng, pipeline ứng viên và phân tích chất lượng hồ sơ</p>
          </div>
          {canRecruit && (
            <button className="primary-action-btn" type="button" onClick={newJob}>
              + Tạo JD mới
            </button>
          )}
        </header>
      )}

      {/* --- FULL-WIDTH JOB BOARD LIST (viewMode === "list") --- */}
      {viewMode === "list" && (
        <section className="ats-full-jobs-view">
          {/* Quick KPI stats row */}
          <div className="ats-kpi-summary-row">
            <div className="kpi-mini-card">
              <span className="kpi-mini-label">TỔNG TIN TUYỂN DỤNG</span>
              <strong className="kpi-mini-val">{results.total}</strong>
            </div>
            <div className="kpi-mini-card published">
              <span className="kpi-mini-label">ĐANG ĐĂNG TUYỂN</span>
              <strong className="kpi-mini-val">{jobs.filter((j) => j.status === "PUBLISHED").length}</strong>
            </div>
            <div className="kpi-mini-card draft">
              <span className="kpi-mini-label">BẢN NHÁP</span>
              <strong className="kpi-mini-val">{jobs.filter((j) => j.status === "DRAFT").length}</strong>
            </div>
            <div className="kpi-mini-card closed">
              <span className="kpi-mini-label">ĐÃ ĐÓNG</span>
              <strong className="kpi-mini-val">{jobs.filter((j) => j.status === "CLOSED").length}</strong>
            </div>
          </div>

          {/* Search, Filter, Sort and Category bar */}
          <div className="ats-full-filter-panel">
            <div className="ats-filter-primary-row">
              <div className="ats-search-input-wrap">
                <SearchIcon size={16} />
                <input
                  type="text"
                  placeholder="Tìm kiếm theo chức danh, địa điểm, yêu cầu kỹ năng…"
                  value={jobSearch}
                  maxLength={200}
                  onChange={(e) => setJobSearch(e.target.value)}
                />
              </div>
              <div className="ats-status-pill-group">
                {(["ALL", "PUBLISHED", "DRAFT", "CLOSED"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`pill-btn ${statusFilter === status ? "active" : ""}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status === "ALL" ? "Tất cả" : status === "PUBLISHED" ? "Đang đăng" : status === "DRAFT" ? "Bản nháp" : "Đã đóng"}
                  </button>
                ))}
              </div>
              <div className="ats-sort-dropdown-wrap">
                <label htmlFor="ats-sort-select">Sắp xếp:</label>
                <select id="ats-sort-select" value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="newest">Cập nhật mới nhất</option>
                  <option value="oldest">Cập nhật cũ nhất</option>
                  <option value="title">Tên vị trí A–Z</option>
                </select>
              </div>
            </div>

            <div className="ats-filter-secondary-row">
              <JobCategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
              <PageControls {...results} onPageChange={results.setPage} label="Phân trang JD công ty" />
            </div>
          </div>

          {results.error && <p className="error-message" role="alert">{results.error} <button type="button" onClick={results.refresh}>Thử lại</button></p>}
          {message && <p className="success-message" role="status">{message}</p>}
          {error && <p className="error-message" role="alert">{error}</p>}

          {loading ? (
            <div className="ats-loading-state">
              <p className="muted">Đang tải danh sách tin tuyển dụng…</p>
            </div>
          ) : (
            <div className="ats-full-job-grid">
              {filteredJobs.map((job) => {
                const isPublished = job.status === "PUBLISHED";
                const isDraft = job.status === "DRAFT";
                const formattedSalary = job.salaryMin && job.salaryMax
                  ? `${(job.salaryMin / 1000000).toFixed(0)}M - ${(job.salaryMax / 1000000).toFixed(0)}M ${job.salaryCurrency ?? "VND"}`
                  : job.salaryNegotiable
                  ? "Lương thỏa thuận"
                  : null;
                const skills = extractSkills(`${job.title} ${job.requirementsText}`);

                return (
                  <article key={job.jobId} className="ats-job-card-rich">
                    <div className="card-top-row">
                      <div className="card-title-group">
                        <div className="card-badges-row">
                          <span className={`status-pill ${isPublished ? "success" : isDraft ? "warning" : "muted"}`}>
                            {isPublished ? "🟢 Đang tuyển" : isDraft ? "🟡 Bản nháp" : "⚪ Đã đóng"}
                          </span>
                          <span className="version-pill">v{job.jobVersionNumber}</span>
                          {job.matchingSupported === false && (
                            <span className="status-pill non-it-pill">Review thủ công</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="job-card-title-link"
                          onClick={() => selectJob(job, "pipeline")}
                        >
                          <strong>{job.title}</strong>
                        </button>
                      </div>

                      <div className="card-quick-actions">
                        {canRecruit && isDraft && (
                          <button
                            type="button"
                            className="quick-action-btn publish"
                            title="Đăng tin tuyển dụng này"
                            onClick={(e) => { e.stopPropagation(); void changeState(job, "publish"); }}
                          >
                            🚀 Đăng tin
                          </button>
                        )}
                        {canRecruit && isPublished && (
                          <button
                            type="button"
                            className="quick-action-btn close"
                            title="Đóng tin tuyển dụng"
                            onClick={(e) => { e.stopPropagation(); void changeState(job, "close"); }}
                          >
                            🛑 Đóng tin
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="card-meta-chips">
                      <span className="spec-chip">📍 {job.locationText ?? "Linh hoạt"}</span>
                      <span className="spec-chip">🏢 {job.workMode ?? "Toàn thời gian"}</span>
                      <span className="spec-chip">🎯 {job.openings} chỉ tiêu</span>
                      {formattedSalary && (
                        <span className="spec-chip salary-chip">💰 {formattedSalary}</span>
                      )}
                      {job.category?.industryName && (
                        <span className="spec-chip category-chip">🏷️ {job.category.industryName}</span>
                      )}
                    </div>

                    {job.description && (
                      <p className="card-desc-snippet">{job.description}</p>
                    )}

                    {skills.length > 0 && (
                      <div className="card-skills-row">
                        {skills.slice(0, 5).map((s) => (
                          <span key={s} className="tech-badge">{s}</span>
                        ))}
                      </div>
                    )}

                    <div className="card-footer-toolbar">
                      <button
                        type="button"
                        className="card-cta-btn primary"
                        onClick={() => selectJob(job, "pipeline")}
                      >
                        👥 Ứng viên &amp; Pipeline
                      </button>
                      <button
                        type="button"
                        className="card-cta-btn secondary"
                        onClick={() => selectJob(job, "analytics")}
                      >
                        📊 Thống kê
                      </button>
                      <button
                        type="button"
                        className="card-cta-btn secondary"
                        onClick={() => selectJob(job, "editor")}
                      >
                        ✏️ Chi tiết tin
                      </button>
                    </div>
                  </article>
                );
              })}

              {filteredJobs.length === 0 && (
                <div className="ats-empty-job-state">
                  <div className="empty-state-icon">📋</div>
                  <h3>Chưa có tin tuyển dụng nào phù hợp</h3>
                  <p>Bắt đầu tạo tin tuyển dụng mới để đăng tuyển và sàng lọc ứng viên thông minh với AI.</p>
                  {canRecruit && (
                    <button className="primary-action-btn" type="button" onClick={newJob}>
                      + Tạo tin tuyển dụng đầu tiên
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* --- DEDICATED WORKSPACE CONTAINER --- */}
      <div
        className={`ats-workspace-full-container ${viewMode === "list" ? "ats-workspace-offscreen" : ""}`}
      >
        <div className="ats-back-navigation-bar">
          <button type="button" className="ats-back-btn" onClick={backToList}>
            ← Quay lại danh sách tin
          </button>
          <div className="ats-breadcrumb-trail">
            <span
              className="crumb-root"
              role="button"
              tabIndex={0}
              onClick={backToList}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") backToList(); }}
            >
              Danh sách tin tuyển dụng
            </span>
            <span className="crumb-sep">/</span>
            <span className="current-crumb">
              {selectedRecord ? selectedRecord.title : "Tạo tin tuyển dụng mới"}
            </span>
          </div>
        </div>

        {/* --- MAIN WORKSPACE --- */}
        <main className="ats-main-workspace full-width">
          {/* Header if a job is selected */}
          {selectedJob && (
            <header className="selected-job-header">
              <div className="selected-job-headline">
                <div className="headline-left">
                  <div className="job-meta-crumbs">
                    <span className="breadcrumb-brand">JD Tuyển dụng</span>
                    <span className="crumb-sep">/</span>
                    <span className={`status-pill ${selectedJob.status === "PUBLISHED" ? "success" : selectedJob.status === "DRAFT" ? "warning" : "muted"}`}>
                      {selectedJob.status === "PUBLISHED" ? "Đang đăng" : selectedJob.status === "DRAFT" ? "Bản nháp" : "Đã đóng"}
                    </span>
                    {selectedJob.matchingSupported === false && (
                      <span className="status-pill non-it-pill">Review thủ công (Ngoài IT)</span>
                    )}
                  </div>
                  <h3>{selectedJob.title}</h3>
                  <div className="job-chips-row">
                    <span className="spec-chip">📍 {selectedJob.locationText ?? "Linh hoạt"}</span>
                    <span className="spec-chip">🏢 {selectedJob.workMode ?? "Toàn thời gian"}</span>
                    <span className="spec-chip">🎯 {selectedJob.openings} chỉ tiêu</span>
                    {selectedJob.salaryMin && selectedJob.salaryMax ? (
                      <span className="spec-chip salary-chip">
                        💰 {(selectedJob.salaryMin / 1000000).toFixed(0)}M - {(selectedJob.salaryMax / 1000000).toFixed(0)}M {selectedJob.salaryCurrency ?? "VND"}
                      </span>
                    ) : selectedJob.salaryNegotiable ? (
                      <span className="spec-chip salary-chip">💰 Lương thỏa thuận</span>
                    ) : null}
                  </div>
                </div>

                {canRecruit && (
                  <div className="headline-actions">
                    {selectedJob.status === "DRAFT" && (
                      <button
                        type="button"
                        className="quick-action-btn publish"
                        onClick={() => changeState(selectedJob, "publish")}
                      >
                        🚀 Đăng JD
                      </button>
                    )}
                    {selectedJob.status === "PUBLISHED" && (
                      <button
                        type="button"
                        className="quick-action-btn close"
                        onClick={() => changeState(selectedJob, "close")}
                      >
                        🛑 Đóng JD
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Sub-tabs: Pipeline vs Editor */}
              <div className="ats-subtabs-nav">
                <button
                  type="button"
                  className={`ats-tab-btn ${activeTab === "pipeline" ? "active" : ""}`}
                  onClick={() => { if (canLeaveDraft()) setActiveTab("pipeline"); }}
                >
                  👥 Ứng viên & Pipeline
                </button>
                <button
                  type="button"
                  className={`ats-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
                  onClick={() => { if (canLeaveDraft()) setActiveTab("analytics"); }}
                >
                  📊 Thống kê tin này
                </button>
                <button
                  type="button"
                  className={`ats-tab-btn ${activeTab === "editor" ? "active" : ""}`}
                  onClick={() => setActiveTab("editor")}
                >
                  ✏️ Chi tiết tin tuyển dụng
                </button>
                {selectedRecord?.matchingSupported !== false && <button type="button" className={`ats-tab-btn ${activeTab === "review" ? "active" : ""}`}
                  onClick={() => { if (formDirty) setError("Lưu tin tuyển dụng trước khi kiểm tra yêu cầu."); else { setActiveTab("review"); setError(null); } }}>Kiểm tra yêu cầu</button>}
              </div>
            </header>
          )}

          {/* VIEW 1: Applications Pipeline */}
          {selectedJobId && activeTab === "pipeline" && (
            <RecruiterApplicationsPanel key={selectedJobId}
              session={session}
              jobId={selectedJobId}
              canTransition={canRecruit}
            />
          )}

          {/* VIEW: Job Specific Analytics */}
          {selectedJobId && activeTab === "analytics" && (
            <JobAnalyticsView
              jobId={selectedJobId}
              jobTitle={selectedJob?.title ?? "Tin tuyển dụng"}
              openings={selectedJob?.openings ?? 1}
              accessToken={session.accessToken}
              onOpenPipeline={() => setActiveTab("pipeline")}
            />
          )}

          {selectedRecord && activeTab === "review" && <section className="workspace-panel focused-jd-review">
            {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
            <DocumentReview title="Nội dung JD gốc đã lưu" source={<div className="jd-source-text">
              <p className="eyebrow">NỘI DUNG GỐC ĐÃ LƯU · BẢN {selectedRecord.jobVersionNumber}</p><h3>{selectedRecord.title}</h3>
              <h4>Mô tả công việc</h4><p>{selectedRecord.description}</p><h4>Yêu cầu ứng viên</h4><p>{selectedRecord.requirementsText}</p>
              {selectedRecord.benefitsText && <><h4>Quyền lợi</h4><p>{selectedRecord.benefitsText}</p></>}
            </div>}>
                {/* 4. AI ParsedJD Review */}
                {selectedRecord?.matchingSupported !== false && <div className="parsed-jd-review modern-parsed-card">
                  <div className="section-heading">
                    <div className="ai-title-wrap">
                      <span className="brand-mark"><SparklesIcon size={16} /></span>
                      <div>
                        <p className="eyebrow">ĐỐI SOÁT THÔNG TIN</p>
                        <h3>Kiểm tra yêu cầu tuyển dụng</h3>
                      </div>
                    </div>
                    <span className={`status-pill ${parsedJd?.status === "CONFIRMED" ? "success" : parsedJd?.status === "PARSED" ? "warning" : "muted"}`}>
                      {loadingParsedJd ? "Đang phân tích…" : parsedJd?.status === "CONFIRMED" ? "Đã xác nhận" : parsedJd ? "Cần kiểm tra" : "Đang chờ phân tích"}
                    </span>
                  </div>

                  {parsedJd && parsedJdDraft && (
                    <div className="parsed-body">
                      <details className="extraction-details"><summary>Chi tiết phân tích tự động</summary><div className="parsed-meta-banner">
                        <span><strong>Revision:</strong> v{parsedJd.revisionNumber}</span>
                        <span><strong>Ngành:</strong> {parsedJdDraft.title.canonicalFamily ?? "OTHER"}</span>
                        <span><strong>Cấp bậc:</strong> {parsedJdDraft.title.level ?? "—"}</span>
                        <span><strong>Độ tin cậy AI:</strong> {Math.round(parsedJdDraft.overallConfidence * 100)}%</span>
                      </div>

                      </details>
                      <p className="muted">Kỹ năng mới được đề xuất riêng cho Job. Kiểm tra tên và nhóm yêu cầu trước khi xác nhận; danh mục kỹ năng chung không tự thay đổi.</p>
                      {(["requiredSkills", "preferredSkills"] as const).map((section) => (
                        <div className="parsed-section" key={section}>
                          <div className="parsed-section-heading">
                            <strong>{section === "requiredSkills" ? "Kỹ năng bắt buộc (Critical)" : "Kỹ năng ưu tiên (Preferred)"}</strong>
                            <button
                              className="secondary-button compact-btn"
                              type="button"
                              disabled={parsedJd.status === "CONFIRMED"}
                              onClick={() => addJdSkill(section)}
                            >
                              + Thêm kỹ năng
                            </button>
                          </div>

                          <div className="parsed-skills-grid">
                            {parsedJdDraft.requirements[section].map((skill, index) => (
                              <div key={`${section}-${index}`}>
                              <div className="parsed-row">
                                <input
                                  value={skill.raw}
                                  disabled={parsedJd.status === "CONFIRMED"}
                                  aria-label={`${section === "requiredSkills" ? "Kỹ năng bắt buộc" : "Kỹ năng ưu tiên"} ${index + 1}`}
                                  onChange={(event) => updateJdSkill(section, index, event.target.value)}
                                  placeholder="Tên kỹ năng..."
                                />
                                <button
                                  className="danger-button compact-btn"
                                  type="button"
                                  disabled={parsedJd.status === "CONFIRMED"}
                                  onClick={() => removeJdSkill(section, index)}
                                >
                                  Xóa
                                </button>
                              </div>
                              {skill.normalizationStatus !== "KNOWN" && <small className="muted">
                                {parsedJd.status === "CONFIRMED" ? "Dùng cho Job này · đối chiếu tên chính xác" : "Kỹ năng mới · cần xác nhận cùng JD"}
                              </small>}
                              </div>
                            ))}
                          </div>
                          {parsedJdDraft.requirements[section].length === 0 && <p className="muted">Không có kỹ năng trong mục này.</p>}
                        </div>
                      ))}

                      <div className="experience-field-wrap">
                        <label>
                          Kinh nghiệm liên quan tối thiểu (tháng)
                          <input
                            type="number"
                            min={0}
                            disabled={parsedJd.status === "CONFIRMED"}
                            value={parsedJdDraft.requirements.minimumRelevantExperienceMonths ?? ""}
                            onChange={(event) => setParsedJdDraft({
                              ...parsedJdDraft,
                              requirements: {
                                ...parsedJdDraft.requirements,
                                minimumRelevantExperienceMonths: event.target.value === "" ? null : Math.max(0, Number(event.target.value))
                              }
                            })}
                          />
                        </label>
                      </div>

                      {extractionNeedsManualReview(parsedJdDraft.qualityFlags) && <p className="muted" role="status">
                        Phân tích tự động chưa đầy đủ, vui lòng kiểm tra và bổ sung.
                      </p>}
                      {visibleQualityFlags(parsedJdDraft.qualityFlags).length > 0 && (
                        <div className="quality-flags-alert">
                          <strong>Cờ chất lượng JD:</strong> {visibleQualityFlags(parsedJdDraft.qualityFlags).join(", ")}
                        </div>
                      )}

                      {reviewDirty && <p role="status">Bạn có thay đổi chưa lưu. Hãy lưu trước khi xác nhận.</p>}
                      {parsedJd.status === "PARSED" && (
                        <div className="button-row ai-confirm-bar">
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={saving || !reviewDirty}
                            onClick={() => void saveParsedJd()}
                          >
                            Lưu thay đổi yêu cầu
                          </button>
                          <button
                            type="button"
                            className="primary-action-btn"
                            disabled={saving || reviewDirty}
                            onClick={() => void confirmParsedJd()}
                          >
                            <CheckCircleIcon size={16} /> Xác nhận yêu cầu tuyển dụng
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!parsedJd && !loadingParsedJd && (
                    <p className="muted">Yêu cầu đang chờ phân tích. Bạn có thể quay lại tin tuyển dụng; chưa thể xác nhận khi chưa có kết quả.</p>
                  )}
                </div>}

            </DocumentReview>
          </section>}

          {/* VIEW 2: JD Editor Form (Shown when activeTab === "editor" OR when creating a new job) */}
          {(!selectedJobId || activeTab === "editor") && (
            <form className="workspace-panel job-form modern-job-form" onSubmit={save}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{selectedJobId ? "Job Editor" : "New Job"}</p>
                  <h3>{selectedJobId ? "Biên tập tin tuyển dụng" : "Tạo tin tuyển dụng mới"}</h3>
                </div>
                <div className="editor-status-indicator">
                  {selectedJobId ? (
                    <span className="version-tag">Phiên bản v{selectedJob?.jobVersionNumber}</span>
                  ) : (
                    <span className="draft-tag">Bản nháp mới</span>
                  )}
                </div>
              </div>

              <fieldset className="permission-fieldset" disabled={!canRecruit}>
                {/* 1. Basic Info */}
                <div className="form-section-card">
                  <h4 className="form-section-title">1. Thông tin chung</h4>
                  <div className="form-grid">
                    <label>
                      Tiêu đề
                      <input
                        required
                        maxLength={240}
                        placeholder="Ví dụ: Senior Backend Java Engineer"
                        value={form.title}
                        onChange={(e) => updateForm("title", e.target.value)}
                      />
                    </label>

                    <label>
                      Địa điểm
                      <input
                        maxLength={300}
                        placeholder="Ví dụ: Tòa FPT Tower, Cầu Giấy, Hà Nội"
                        value={form.locationText}
                        onChange={(e) => updateForm("locationText", e.target.value)}
                      />
                    </label>

                    <label>
                      Quốc gia
                      <input
                        pattern="[A-Z]{2}"
                        maxLength={2}
                        value={form.countryCode}
                        onChange={(e) => updateForm("countryCode", e.target.value.toUpperCase())}
                      />
                    </label>

                    <label>
                      Hình thức
                      <select value={form.workMode} onChange={(e) => updateForm("workMode", e.target.value)}>
                        <option value="">Chọn</option>
                        <option>ONSITE</option>
                        <option>HYBRID</option>
                        <option>REMOTE</option>
                      </select>
                    </label>

                    <label>
                      Loại hợp đồng
                      <select value={form.employmentType} onChange={(e) => updateForm("employmentType", e.target.value)}>
                        <option>FULL_TIME</option>
                        <option>PART_TIME</option>
                        <option>CONTRACT</option>
                        <option>INTERNSHIP</option>
                      </select>
                    </label>

                    <label>
                      Cấp độ
                      <input
                        maxLength={30}
                        placeholder="Senior, Lead, Mid..."
                        value={form.seniorityLevel}
                        onChange={(e) => updateForm("seniorityLevel", e.target.value)}
                      />
                    </label>

                    <label>
                      Số vị trí
                      <input
                        type="number"
                        min={1}
                        required
                        value={form.openings}
                        onChange={(e) => updateForm("openings", Number(e.target.value))}
                      />
                    </label>

                    <label>
                      Hạn nhận hồ sơ
                      <input
                        type="datetime-local"
                        value={form.applicationDeadline}
                        onChange={(e) => updateForm("applicationDeadline", e.target.value)}
                      />
                    </label>
                  </div>
                </div>

                {/* 2. Description & Requirements */}
                <div className="form-section-card">
                  <h4 className="form-section-title">2. Bản mô tả & Tiêu chuẩn ứng viên</h4>
                  <div className="form-full-stack">
                    <label>
                      Mô tả công việc
                      <textarea
                        required
                        rows={5}
                        placeholder="Mô tả trách nhiệm công việc chính, dự án tham gia..."
                        value={form.description}
                        onChange={(e) => updateForm("description", e.target.value)}
                      />
                    </label>

                    <label>
                      Yêu cầu
                      <textarea
                        required
                        rows={5}
                        placeholder="Kỹ năng kỹ thuật, số năm kinh nghiệm, bằng cấp liên quan..."
                        value={form.requirementsText}
                        onChange={(e) => updateForm("requirementsText", e.target.value)}
                      />
                    </label>

                    <label>
                      Quyền lợi
                      <textarea
                        rows={3}
                        placeholder="Chế độ đãi ngộ, bảo hiểm, thưởng, laptop..."
                        value={form.benefitsText}
                        onChange={(e) => updateForm("benefitsText", e.target.value)}
                      />
                    </label>
                  </div>
                </div>

                {/* 3. Salary & Compensation */}
                <div className="form-section-card">
                  <h4 className="form-section-title">3. Mức lương & Đãi ngộ</h4>
                  <div className="form-grid">
                    <label>
                      Lương tối thiểu
                      <input
                        type="number"
                        min={0}
                        placeholder="25000000"
                        value={form.salaryMin}
                        onChange={(e) => updateForm("salaryMin", e.target.value)}
                      />
                    </label>

                    <label>
                      Lương tối đa
                      <input
                        type="number"
                        min={0}
                        placeholder="45000000"
                        value={form.salaryMax}
                        onChange={(e) => updateForm("salaryMax", e.target.value)}
                      />
                    </label>

                    <label>
                      Tiền tệ
                      <input
                        maxLength={3}
                        value={form.salaryCurrency}
                        onChange={(e) => updateForm("salaryCurrency", e.target.value.toUpperCase())}
                      />
                    </label>

                    <label>
                      Kỳ lương
                      <select value={form.salaryPeriod} onChange={(e) => updateForm("salaryPeriod", e.target.value)}>
                        <option>HOUR</option>
                        <option>MONTH</option>
                        <option>YEAR</option>
                      </select>
                    </label>
                  </div>
                </div>

                {message && <p className="success-message" role="status">{message}</p>}
                {error && <p className="error-message" role="alert">{error}</p>}

                {/* 4. Category & Screening */}
                <div className="form-section-card ai-section-card">
                  <div className="form-section-header">
                    <div className="ai-badge-row">
                      <span className="brand-mark"><SparklesIcon size={14} /></span>
                      <h4 className="form-section-title">4. Ngành nghề &amp; Hỗ trợ sàng lọc tự động</h4>
                    </div>
                  </div>
                  <JobCategoryFields value={form.category} onChange={(value) => updateForm("category", value)} />
                  {selectedRecord?.matchingSupported === false && <p role="status">Tin này không áp dụng chấm điểm AI; xem hồ sơ thủ công.</p>}
                  <div className="ai-consent-wrapper">
                    <ExternalAiConsent checked={form.externalAiConsent} disabled={saving}
                      onChange={(value) => updateForm("externalAiConsent", value)} />
                  </div>
                  <CareerCategorySuggestions draft={form} userId={session.userId} companyId={companyId}
                    jobId={selectedJobId} jobVersionId={selectedRecord?.jobVersionId ?? null}
                    accessToken={session.accessToken}
                    disabled={!canRecruit || saving || !!selectedRecord && selectedRecord.status !== "DRAFT"}
                    onApply={(value) => {
                      updateForm("category", value); setError(null);
                      setMessage("Đã áp dụng gợi ý vào biểu mẫu. Lưu bản nháp để ghi nhận thay đổi.");
                    }} />
                </div>
                {/* Form Footer Action Bar */}
                <div className="button-row form-submit-bar">
                  <button type="submit" className="primary-action-btn" disabled={saving}>
                    {saving ? "Đang lưu…" : selectedJobId ? "Lưu JD" : "Tạo bản nháp"}
                  </button>

                  {selectedJobId && jobs.find((job) => job.jobId === selectedJobId)?.status === "DRAFT" && (
                    <button
                      className="secondary-button success-border"
                      type="button"
                      onClick={() => {
                        const job = selectedRecord;
                        if (job) void changeState(job, "publish");
                      }}
                    >
                      Đăng JD
                    </button>
                  )}

                  {selectedJobId && jobs.find((job) => job.jobId === selectedJobId)?.status === "PUBLISHED" && (
                    <button
                      className="secondary-button danger-border"
                      type="button"
                      onClick={() => {
                        const job = selectedRecord;
                        if (job) void changeState(job, "close");
                      }}
                    >
                      Đóng JD
                    </button>
                  )}
                </div>
              </fieldset>
            </form>
          )}

          {!canRecruit && <p className="muted">Bạn có quyền xem JD và pipeline, nhưng không thể sửa hoặc chuyển trạng thái.</p>}
        </main>
      </div>
    </div>
  );
}

function toForm(job: Job): JobForm {
  return {
    title: job.title,
    description: job.description,
    requirementsText: job.requirementsText,
    benefitsText: job.benefitsText ?? "",
    locationText: job.locationText ?? "",
    countryCode: job.countryCode ?? "VN",
    workMode: job.workMode ?? "",
    employmentType: job.employmentType ?? "FULL_TIME",
    seniorityLevel: job.seniorityLevel ?? "",
    openings: job.openings,
    salaryMin: job.salaryMin?.toString() ?? "",
    salaryMax: job.salaryMax?.toString() ?? "",
    salaryCurrency: job.salaryCurrency ?? "VND",
    salaryPeriod: job.salaryPeriod ?? "MONTH",
    salaryNegotiable: job.salaryNegotiable,
    applicationDeadline: job.applicationDeadline ? job.applicationDeadline.slice(0, 16) : "",
    externalAiConsent: job.externalAiConsent === true && job.externalAiPolicyVersion === externalAiPolicyVersion,
    category: job.category ?? { ...defaultCategory, positionName: job.title }
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}

const commonTechs = ["Java", "Kafka", "Spring Boot", "React", "Python", "Docker", "PostgreSQL", "AWS", "TypeScript", "Node.js", "AI", "Go", "SQL", "Kubernetes", "C#", ".NET", "Vue", "Angular"];
function extractSkills(text: string): string[] {
  return commonTechs.filter((tech) => new RegExp(`\\b${tech.replace(".", "\\.")}\\b`, "i").test(text));
}

function JobAnalyticsView({ jobId, jobTitle, openings, accessToken, onOpenPipeline }: {
  jobId: string;
  jobTitle: string;
  openings: number;
  accessToken: string;
  onOpenPipeline: () => void;
}) {
  const [apps, setApps] = useState<Array<{ applicationId: string; status: string; appliedAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: Array<{ applicationId: string; status: string; appliedAt: string }>; total: number }>(
      `/api/v2/recruiter/applications?jobId=${jobId}&page=0&size=100`,
      { accessToken }
    )
      .then((data) => { if (active) setApps(data.items); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId, accessToken]);

  const total = apps.length;
  const submitted = apps.filter((a) => a.status === "SUBMITTED").length;
  const underReview = apps.filter((a) => a.status === "UNDER_REVIEW").length;
  const shortlisted = apps.filter((a) => a.status === "SHORTLISTED").length;
  const rejected = apps.filter((a) => a.status === "REJECTED").length;
  const conversionRate = total > 0 ? Math.round((shortlisted / total) * 100) : 0;
  const pending = submitted + underReview;

  return (
    <section className="workspace-panel job-analytics-panel" aria-label="Báo cáo thống kê tin tuyển dụng">
      <div className="section-heading">
        <div>
          <p className="eyebrow">HIỆU QUẢ TUYỂN DỤNG</p>
          <h3>Báo cáo thống kê: {jobTitle}</h3>
        </div>
        <button type="button" className="primary-action-btn" onClick={onOpenPipeline}>
          Xem Kanban Pipeline →
        </button>
      </div>

      <div className="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <span className="kpi-icon">👥</span>
          <div>
            <strong>{total}</strong>
            <p>Tổng hồ sơ nộp</p>
          </div>
          <span className="kpi-sub">{openings} chỉ tiêu tuyển</span>
        </div>

        <div className="analytics-kpi-card urgent">
          <span className="kpi-icon">⚡</span>
          <div>
            <strong>{pending}</strong>
            <p>Chờ xử lý</p>
          </div>
          <span className="kpi-sub">{submitted} mới, {underReview} xem xét</span>
        </div>

        <div className="analytics-kpi-card success">
          <span className="kpi-icon">⭐</span>
          <div>
            <strong>{shortlisted}</strong>
            <p>Vào Shortlist</p>
          </div>
          <span className="kpi-sub">Tỷ lệ: {conversionRate}%</span>
        </div>

        <div className="analytics-kpi-card neutral">
          <span className="kpi-icon">📊</span>
          <div>
            <strong>{total > 0 ? (total / Math.max(1, openings)).toFixed(1) : "0"}</strong>
            <p>Ứng viên / chỉ tiêu</p>
          </div>
          <span className="kpi-sub">{rejected} hồ sơ từ chối</span>
        </div>
      </div>

      <div className="job-funnel-card">
        <h4 style={{ marginBottom: "14px" }}>Phễu chuyển đổi ứng viên</h4>
        <div className="recruiter-funnel-steps">
          <div className="funnel-step">
            <div className="funnel-step-head"><span className="step-num">1</span><span className="step-name">Mới nộp</span></div>
            <strong className="step-val">{submitted}</strong>
            <div className="step-bar-wrap"><div className="step-bar" style={{ width: total > 0 ? `${Math.round((submitted / total) * 100)}%` : "0%", background: "#3b82f6" }}></div></div>
            <small className="step-rate">{total > 0 ? `${Math.round((submitted / total) * 100)}%` : "0%"}</small>
          </div>
          <div className="funnel-arrow">➔</div>
          <div className="funnel-step">
            <div className="funnel-step-head"><span className="step-num">2</span><span className="step-name">Đang xem xét</span></div>
            <strong className="step-val">{underReview}</strong>
            <div className="step-bar-wrap"><div className="step-bar" style={{ width: total > 0 ? `${Math.round((underReview / total) * 100)}%` : "0%", background: "#f59e0b" }}></div></div>
            <small className="step-rate">{total > 0 ? `${Math.round((underReview / total) * 100)}%` : "0%"}</small>
          </div>
          <div className="funnel-arrow">➔</div>
          <div className="funnel-step">
            <div className="funnel-step-head"><span className="step-num">3</span><span className="step-name">Shortlist</span></div>
            <strong className="step-val">{shortlisted}</strong>
            <div className="step-bar-wrap"><div className="step-bar" style={{ width: total > 0 ? `${Math.round((shortlisted / total) * 100)}%` : "0%", background: "#10b981" }}></div></div>
            <small className="step-rate">{conversionRate}%</small>
          </div>
          <div className="funnel-arrow">➔</div>
          <div className="funnel-step">
            <div className="funnel-step-head"><span className="step-num">4</span><span className="step-name">Từ chối</span></div>
            <strong className="step-val">{rejected}</strong>
            <div className="step-bar-wrap"><div className="step-bar" style={{ width: total > 0 ? `${Math.round((rejected / total) * 100)}%` : "0%", background: "#94a3b8" }}></div></div>
            <small className="step-rate">{total > 0 ? `${Math.round((rejected / total) * 100)}%` : "0%"}</small>
          </div>
        </div>
      </div>
    </section>
  );
}
