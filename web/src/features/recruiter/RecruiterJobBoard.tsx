import { FormEvent, useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { usePagedResource } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { externalAiPolicyVersion } from "../../shared/components/ExternalAiConsent";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { Badge, Button, ErrorBanner, cn } from "../../shared/ui";
import { CategoryFilterValue, emptyCategoryFilter } from "./JobCategoryFilter";
import { RecruiterApplicationsPanel } from "./RecruiterApplicationsPanel";
import { RecruiterJdReview } from "./RecruiterJdReview";
import { RecruiterJobAnalytics } from "./RecruiterJobAnalytics";
import { RecruiterJobEditor } from "./RecruiterJobEditor";
import { RecruiterJobList } from "./RecruiterJobList";
import {
  emptyJob,
  formatJobSalary,
  getJobErrorMessage,
  JdSkill,
  Job,
  JobForm,
  jobStatusLabel,
  jobStatusTone,
  ParsedJd,
  toForm,
  WorkspaceTab
} from "./recruiterJobTypes";

export function RecruiterJobBoard({
  session,
  companyId,
  canRecruit,
  companyStatus = "PENDING",
  initialJobId
}: {
  session: AuthSession;
  companyId: string | null;
  canRecruit: boolean;
  companyStatus?: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  initialJobId?: string | null;
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

  const [viewMode, setViewMode] = useState<"list" | "workspace">(initialJobId ? "workspace" : "list");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialJobId ? "pipeline" : "editor");
  const [jobSearch, setJobSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sort, setSort] = useState("newest");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(emptyCategoryFilter);

  const results = usePagedResource<Job>(
    companyId ? `/api/v2/companies/${companyId}/jobs` : null,
    { q: jobSearch, status: statusFilter === "ALL" ? "" : statusFilter, sort, ...categoryFilter },
    session.accessToken
  );
  const jobs = results.items;

  useEffect(() => {
    setSelectedJobId(null);
    setSelectedRecord(null);
    setForm(emptyJob);
    setActiveTab("editor");
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
      return () => {
        active = false;
      };
    }
    setLoadingParsedJd(true);
    void (async () => {
      for (let attempt = 0; attempt < 8 && active; attempt += 1) {
        try {
          const result = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${selected.jobVersionId}`, {
            accessToken: session.accessToken
          });
          if (active) {
            setParsedJd(result);
            setParsedJdDraft(structuredClone(result.payload));
          }
          return;
        } catch (requestError) {
          const pending = requestError instanceof ApiClientError && requestError.status === 404;
          if (!pending) {
            if (active) setError(getJobErrorMessage(requestError));
            return;
          }
          if (attempt < 7) await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
      if (active) {
        setParsedJd(null);
        setParsedJdDraft(null);
      }
    })().finally(() => {
      if (active) setLoadingParsedJd(false);
    });
    return () => {
      active = false;
    };
  }, [selectedRecord, session.accessToken, session.userId]);

  const reviewDirty =
    !!parsedJd && !!parsedJdDraft && JSON.stringify(parsedJdDraft) !== JSON.stringify(parsedJd.payload);
  const formDirty = JSON.stringify(form) !== JSON.stringify(selectedRecord ? toForm(selectedRecord) : emptyJob);
  useUnsavedChanges(reviewDirty || formDirty, () =>
    setError("Bạn còn thay đổi chưa lưu. Hãy lưu trước khi chuyển màn hình.")
  );

  function canLeaveDraft(): boolean {
    if (reviewDirty || formDirty || saving) {
      setError("Bạn còn thay đổi chưa lưu hoặc đang xử lý. Hãy lưu trước khi đổi tin tuyển dụng.");
      return false;
    }
    return true;
  }

  function selectJob(job: Job, targetTab: WorkspaceTab = "pipeline") {
    if (!canLeaveDraft()) return;
    setSelectedJobId(job.jobId);
    setSelectedRecord(job);
    setForm(toForm(job));
    setActiveTab(targetTab);
    setViewMode("workspace");
    setMessage(null);
    setError(null);
  }

  function newJob() {
    if (!canLeaveDraft()) return;
    setSelectedJobId(null);
    setSelectedRecord(null);
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
    setForm(emptyJob);
    setMessage(null);
    setError(null);
  }

  function updateForm<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
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
      const saved = await apiRequest<Job>(
        selectedJobId ? `/api/v2/jobs/${selectedJobId}` : `/api/v2/companies/${companyId}/jobs`,
        {
          method: selectedJobId ? "PUT" : "POST",
          accessToken: session.accessToken,
          body: JSON.stringify(payload)
        }
      );
      setSelectedRecord(saved);
      results.refresh();
      setSelectedJobId(saved.jobId);
      setForm(toForm(saved));
      setActiveTab("editor");
      setViewMode("workspace");
      setParsedJd(null);
      setParsedJdDraft(null);
      setMessage(
        saved.matchingSupported === false
          ? "Đã lưu tin. Ngành này chưa hỗ trợ AI; có thể đăng tin và tuyển dụng thủ công."
          : selectedJobId
            ? "JD đã được cập nhật; yêu cầu parse đã được đưa vào hàng đợi."
            : "JD nháp đã được tạo; yêu cầu parse đã được đưa vào hàng đợi."
      );
    } catch (requestError) {
      setError(getJobErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function changeState(job: Job, action: "publish" | "close") {
    setMessage(null);
    setError(null);
    if (action === "publish" && companyStatus !== "ACTIVE") {
      setError("Công ty cần được Admin duyệt hoạt động trước khi đăng tin.");
      return;
    }
    if (saving || formDirty || reviewDirty) {
      setError("Hãy lưu các thay đổi trước khi đăng hoặc đóng tin.");
      return;
    }
    setSaving(true);
    try {
      if (action === "publish" && job.matchingSupported !== false) {
        const currentParsedJd = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${job.jobVersionId}`, {
          accessToken: session.accessToken
        });
        if (currentParsedJd.status !== "CONFIRMED") {
          setError("Cần review và xác nhận ParsedJD trước khi đăng JD.");
          return;
        }
      }
      const updated = await apiRequest<Job>(`/api/v2/jobs/${job.jobId}/${action}?version=${job.version}`, {
        method: "POST",
        accessToken: session.accessToken
      });
      results.refresh();
      if (selectedJobId === updated.jobId) {
        setSelectedRecord(updated);
        setForm(toForm(updated));
      }
      setMessage(action === "publish" ? "JD đã được đăng." : "JD đã được đóng.");
    } catch (requestError) {
      setError(getJobErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmParsedJd() {
    if (!parsedJd || reviewDirty || saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const confirmed = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${parsedJd.jobVersionId}/confirm`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ expectedRevisionId: parsedJd.revisionId })
      });
      setParsedJd(confirmed);
      setParsedJdDraft(structuredClone(confirmed.payload));
      setMessage("Đã xác nhận yêu cầu tuyển dụng. Trạng thái đăng tin sẽ cập nhật sau khi xử lý.");
    } catch (requestError) {
      setError(getJobErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function saveParsedJd() {
    if (!parsedJd || !parsedJdDraft) return;
    const allSkills = [...parsedJdDraft.requirements.requiredSkills, ...parsedJdDraft.requirements.preferredSkills];
    if (allSkills.some((skill) => !skill.raw.trim())) {
      setError("Kỹ năng trong ParsedJD không được để trống.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const updated = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${parsedJd.jobVersionId}`, {
        method: "PATCH",
        accessToken: session.accessToken,
        body: JSON.stringify({ expectedRevisionId: parsedJd.revisionId, payload: parsedJdDraft })
      });
      setParsedJd(updated);
      setParsedJdDraft(structuredClone(updated.payload));
      setMessage("Đã lưu ParsedJD revision mới. Kiểm tra lại rồi xác nhận.");
    } catch (requestError) {
      setError(getJobErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function updateJdSkill(section: "requiredSkills" | "preferredSkills", index: number, raw: string) {
    if (!parsedJdDraft) return;
    setParsedJdDraft({
      ...parsedJdDraft,
      requirements: {
        ...parsedJdDraft.requirements,
        [section]: parsedJdDraft.requirements[section].map((skill, itemIndex) =>
          itemIndex === index ? { ...skill, raw } : skill
        )
      }
    });
  }

  function addJdSkill(section: "requiredSkills" | "preferredSkills") {
    if (!parsedJdDraft) return;
    const skill: JdSkill = {
      raw: "",
      canonicalSkillId: null,
      normalizationStatus: "UNRESOLVED",
      criticality: section === "requiredSkills" ? "CRITICAL" : "NORMAL",
      minimumMonths: null,
      evidenceIds: [],
      confidence: 1,
      confirmedByRecruiter: true
    };
    setParsedJdDraft({
      ...parsedJdDraft,
      requirements: {
        ...parsedJdDraft.requirements,
        [section]: [...parsedJdDraft.requirements[section], skill]
      }
    });
  }

  function removeJdSkill(section: "requiredSkills" | "preferredSkills", index: number) {
    if (!parsedJdDraft) return;
    setParsedJdDraft({
      ...parsedJdDraft,
      requirements: {
        ...parsedJdDraft.requirements,
        [section]: parsedJdDraft.requirements[section].filter((_, itemIndex) => itemIndex !== index)
      }
    });
  }

  if (!companyId) return null;

  const selectedJob = selectedRecord;
  const canPublish = canRecruit && companyStatus === "ACTIVE";
  const salaryLabel = selectedJob ? formatJobSalary(selectedJob) : null;

  return (
    <div className="space-y-6">
      {companyStatus !== "ACTIVE" && <ErrorBanner tone="info" message={companyStatus === "PENDING"
        ? "Công ty đang chờ Admin duyệt. Bạn có thể chuẩn bị bản nháp; chỉ công ty đang hoạt động được đăng tin. Tải lại workspace sau khi được duyệt."
        : "Công ty hiện chưa hoạt động nên không thể đăng tin tuyển dụng."} />}
      {viewMode === "list" && (
        <RecruiterJobList
          jobs={jobs}
          paging={results}
          canRecruit={canRecruit}
          canPublish={canPublish}
          jobSearch={jobSearch}
          onJobSearchChange={setJobSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sort={sort}
          onSortChange={setSort}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          message={message}
          error={error}
          onNewJob={newJob}
          onSelectJob={selectJob}
          onChangeState={(job, action) => void changeState(job, action)}
        />
      )}

      {/* Keep editor mounted offscreen in list view so direct form tests and draft preservation work consistently. */}
      <div
        className={cn(
          viewMode === "list"
            ? "fixed -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0 pointer-events-none"
            : "space-y-5"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={backToList}>
            ← Quay lại danh sách tin
          </Button>
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <span
              className="font-medium text-ink-700 hover:text-brand-700 cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={backToList}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") backToList();
              }}
            >
              Danh sách tin tuyển dụng
            </span>
            <span>/</span>
            <span className="font-semibold text-ink-900">
              {selectedRecord ? selectedRecord.title : "Tạo tin tuyển dụng mới"}
            </span>
          </div>
        </div>

        <main className="space-y-5">
          {selectedJobId && activeTab !== "editor" && activeTab !== "review" && (
            <>
              {message && <ErrorBanner tone="success" message={message} />}
              {error && <ErrorBanner tone="error" message={error} />}
            </>
          )}
          {selectedJob && (
            <header className="rounded-2xl bg-slate-900 text-white px-6 py-5 shadow-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">
                      JD Tuyển dụng
                    </span>
                    <Badge tone={jobStatusTone(selectedJob.status)}>{jobStatusLabel(selectedJob.status)}</Badge>
                    <Badge tone="neutral">v{selectedJob.jobVersionNumber}</Badge>
                    {selectedJob.matchingSupported === false && <Badge tone="info">Review thủ công (Ngoài IT)</Badge>}
                  </div>
                  <h3 className="text-xl font-bold text-white m-0">{selectedJob.title}</h3>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">
                      📍 {selectedJob.locationText ?? "Linh hoạt"}
                    </span>
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">
                      🏢 {selectedJob.workMode ?? "Toàn thời gian"}
                    </span>
                    <span className="rounded-lg bg-white/10 px-2.5 py-1">🎯 {selectedJob.openings} chỉ tiêu</span>
                    {salaryLabel && <span className="rounded-lg bg-white/10 px-2.5 py-1">💰 {salaryLabel}</span>}
                  </div>
                </div>

                {canRecruit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedJob.status === "DRAFT" && (
                      <Button variant="primary" size="sm" disabled={!canPublish || saving} onClick={() => void changeState(selectedJob, "publish")}>
                        🚀 Đăng JD
                      </Button>
                    )}
                    {selectedJob.status === "PUBLISHED" && (
                      <Button variant="danger" size="sm" onClick={() => void changeState(selectedJob, "close")}>
                        🛑 Đóng JD
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                {[
                  { id: "pipeline" as const, label: "👥 Ứng viên & Pipeline" },
                  { id: "analytics" as const, label: "📊 Thống kê tin này" },
                  { id: "editor" as const, label: "✏️ Chi tiết tin tuyển dụng" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (tab.id === "editor" || canLeaveDraft()) setActiveTab(tab.id);
                    }}
                    className={cn(
                      "rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                      activeTab === tab.id
                        ? "bg-white text-ink-900 shadow-xs"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
                {selectedRecord?.matchingSupported !== false && (
                  <button
                    type="button"
                    onClick={() => {
                      if (formDirty) setError("Lưu tin tuyển dụng trước khi kiểm tra yêu cầu.");
                      else {
                        setActiveTab("review");
                        setError(null);
                      }
                    }}
                    className={cn(
                      "rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                      activeTab === "review"
                        ? "bg-white text-ink-900 shadow-xs"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    Kiểm tra yêu cầu
                  </button>
                )}
              </div>
            </header>
          )}

          {selectedJobId && activeTab === "pipeline" && (
            <RecruiterApplicationsPanel
              key={selectedJobId}
              session={session}
              jobId={selectedJobId}
              canTransition={canRecruit}
            />
          )}

          {selectedJobId && activeTab === "analytics" && (
            <RecruiterJobAnalytics
              jobId={selectedJobId}
              jobTitle={selectedJob?.title ?? "Tin tuyển dụng"}
              openings={selectedJob?.openings ?? 1}
              accessToken={session.accessToken}
              onOpenPipeline={() => setActiveTab("pipeline")}
            />
          )}

          {selectedRecord && activeTab === "review" && (
            <RecruiterJdReview
              selectedRecord={selectedRecord}
              parsedJd={parsedJd}
              parsedJdDraft={parsedJdDraft}
              loadingParsedJd={loadingParsedJd}
              reviewDirty={reviewDirty}
              saving={saving}
              message={message}
              error={error}
              onAddSkill={addJdSkill}
              onUpdateSkill={updateJdSkill}
              onRemoveSkill={removeJdSkill}
              onUpdateExperienceMonths={(months) => {
                if (!parsedJdDraft) return;
                setParsedJdDraft({
                  ...parsedJdDraft,
                  requirements: {
                    ...parsedJdDraft.requirements,
                    minimumRelevantExperienceMonths: months
                  }
                });
              }}
              onSaveParsedJd={() => void saveParsedJd()}
              onConfirmParsedJd={() => void confirmParsedJd()}
            />
          )}

          {(!selectedJobId || activeTab === "editor") && (
            <RecruiterJobEditor
              form={form}
              selectedJob={selectedJob}
              selectedJobId={selectedJobId}
              companyId={companyId}
              session={session}
              canRecruit={canRecruit}
              canPublish={canPublish}
              saving={saving}
              message={message}
              error={error}
              onUpdateForm={updateForm}
              onSubmit={save}
              onChangeState={(job, action) => void changeState(job, action)}
              onSuggestionApplied={(value) => {
                updateForm("category", value);
                setError(null);
                setMessage("Đã áp dụng gợi ý vào biểu mẫu. Lưu bản nháp để ghi nhận thay đổi.");
              }}
            />
          )}

          {!canRecruit && (
            <ErrorBanner
              tone="info"
              message="Bạn có quyền xem JD và pipeline, nhưng không thể sửa hoặc chuyển trạng thái."
            />
          )}
        </main>
      </div>
    </div>
  );
}
