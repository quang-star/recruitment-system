import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { usePagedResource } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { externalAiPolicyVersion } from "../../shared/components/ExternalAiConsent";
import {
  BanknoteIcon,
  BarChartIcon,
  CompanyIcon,
  MapPinIcon,
  PencilIcon,
  UsersIcon
} from "../../shared/components/Icon";
import { RichTextContent, richTextToPlainText } from "../../shared/components/RichTextEditor";
import { EnsureRouter, routes } from "../../shared/router";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { Badge, Button, Card, ErrorBanner, cn } from "../../shared/ui";
import { formatJobLocation, workModeLabel } from "../public/jobPresentation";
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

type BoardCompanyOption = {
  companyId: string;
  displayName: string;
  status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
};

const validWorkspaceTabs: readonly WorkspaceTab[] = ["editor", "review", "preview", "pipeline", "analytics"];

function parseWorkspaceTab(search: string): WorkspaceTab | null {
  const tab = new URLSearchParams(search).get("tab");
  return tab && validWorkspaceTabs.includes(tab as WorkspaceTab) ? (tab as WorkspaceTab) : null;
}

type RecruiterJobBoardProps = {
  session: AuthSession;
  companyId: string | null;
  companyName?: string | null;
  companies?: BoardCompanyOption[];
  onSelectCompany?: (companyId: string) => void;
  canRecruit: boolean;
  companyStatus?: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  initialJobId?: string | null;
  initialNewJob?: boolean;
};

function RecruiterJobBoardContent({
  session,
  companyId,
  companyName = null,
  companies = [],
  onSelectCompany,
  canRecruit,
  companyStatus = "PENDING",
  initialJobId,
  initialNewJob = false
}: RecruiterJobBoardProps) {
  const location = useLocation();
  const rawNavigate = useNavigate();
  const normalizedPath = location.pathname.replace(/\/+$/, "") || "/";
  const routeIsNewJob = initialNewJob || normalizedPath === routes.recruiter.newJob;
  const routeTab = parseWorkspaceTab(location.search);

  const [selectedRecord, setSelectedRecord] = useState<Job | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId ?? null);
  const [draftCompanyId, setDraftCompanyId] = useState<string | null>(companyId);
  const [form, setForm] = useState<JobForm>(emptyJob);
  const [saving, setSaving] = useState(false);
  const [parsedJd, setParsedJd] = useState<ParsedJd | null>(null);
  const [parsedJdDraft, setParsedJdDraft] = useState<ParsedJd["payload"] | null>(null);
  const [loadingParsedJd, setLoadingParsedJd] = useState(false);
  const [parsedJdRefreshTick, setParsedJdRefreshTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"list" | "workspace">(
    initialJobId || routeIsNewJob ? "workspace" : "list"
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    routeTab ?? (initialJobId ? "pipeline" : "editor")
  );
  const [jobSearch, setJobSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const param = new URLSearchParams(window.location.search).get("status");
    return param && ["DRAFT", "PUBLISHED", "CLOSED"].includes(param) ? param : "ALL";
  });
  const [sort, setSort] = useState("newest");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(emptyCategoryFilter);
  const [companyCounts, setCompanyCounts] = useState<{
    jobs?: number;
    publishedJobs?: number;
    draftJobs?: number;
    closedJobs?: number;
  } | null>(null);
  const [countsTick, setCountsTick] = useState(0);

  const results = usePagedResource<Job>(
    companyId ? `/api/v2/companies/${companyId}/jobs` : null,
    { q: jobSearch, status: statusFilter === "ALL" ? "" : statusFilter, sort, ...categoryFilter },
    session.accessToken
  );
  const jobs = results.items;

  useEffect(() => {
    if (!companyId) {
      setCompanyCounts(null);
      return;
    }
    let active = true;
    void apiRequest<{ metrics?: Record<string, number> }>(`/api/v2/dashboard?companyId=${companyId}`, {
      accessToken: session.accessToken
    })
      .then((res) => {
        if (active && res?.metrics) setCompanyCounts(res.metrics);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [companyId, session.accessToken, countsTick]);
  const handledInitialJobRef = useRef<string | null>(null);
  const skipCompanyResetRef = useRef(false);
  const prevCompanyIdRef = useRef<string | null>(companyId);
  const prevLocationRef = useRef({ pathname: normalizedPath, search: location.search });

  useEffect(() => {
    setDraftCompanyId(companyId);
    const companyChanged = prevCompanyIdRef.current !== companyId;
    prevCompanyIdRef.current = companyId;
    if (!companyChanged) return;
    if (skipCompanyResetRef.current) {
      skipCompanyResetRef.current = false;
      return;
    }
    setSelectedJobId(null);
    setSelectedRecord(null);
    setForm(emptyJob);
    setActiveTab("editor");
    setViewMode("list");
    handledInitialJobRef.current = null;
    if (normalizedPath !== routes.recruiter.jobs && normalizedPath.startsWith(routes.recruiter.jobs)) {
      rawNavigate(routes.recruiter.jobs, { replace: true });
    }
  }, [companyId, normalizedPath, rawNavigate]);

  useEffect(() => {
    const prev = prevLocationRef.current;
    if (prev.pathname === normalizedPath && prev.search === location.search) return;
    prevLocationRef.current = { pathname: normalizedPath, search: location.search };

    if (normalizedPath === routes.recruiter.jobs) {
      setViewMode("list");
      setSelectedJobId(null);
      setSelectedRecord(null);
      setForm(emptyJob);
      setMessage(null);
      setError(null);
      return;
    }
    if (normalizedPath === routes.recruiter.newJob) {
      if (viewMode !== "workspace" || selectedJobId !== null) {
        setSelectedJobId(null);
        setSelectedRecord(null);
        setForm(emptyJob);
        setActiveTab("editor");
        setViewMode("workspace");
        setMessage(null);
        setError(null);
      }
      return;
    }
    if (normalizedPath.startsWith(`${routes.recruiter.jobs}/`) && routeTab && routeTab !== activeTab) {
      setActiveTab(routeTab);
    }
  }, [activeTab, location.search, normalizedPath, routeTab, selectedJobId, viewMode]);

  useEffect(() => {
    if (!initialJobId || !companyId) return;
    const key = `${companyId}:${initialJobId}`;
    if (handledInitialJobRef.current === key) return;
    const target = jobs.find((j) => j.jobId === initialJobId);
    if (target) {
      handledInitialJobRef.current = key;
      setSelectedJobId(target.jobId);
      setSelectedRecord(target);
      setForm(toForm(target));
      setActiveTab(routeTab ?? (target.status === "DRAFT" ? "editor" : "pipeline"));
      setViewMode("workspace");
      return;
    }
    let active = true;
    void apiRequest<Job>(`/api/v2/jobs/${encodeURIComponent(initialJobId)}`, {
      accessToken: session.accessToken
    })
      .then((fetched) => {
        if (!active || fetched.companyId !== companyId) return;
        handledInitialJobRef.current = key;
        setSelectedJobId(fetched.jobId);
        setSelectedRecord(fetched);
        setForm(toForm(fetched));
        setActiveTab(routeTab ?? (fetched.status === "DRAFT" ? "editor" : "pipeline"));
        setViewMode("workspace");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [initialJobId, jobs, companyId, session.accessToken]);

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
  }, [selectedRecord, session.accessToken, session.userId, parsedJdRefreshTick]);

  const reviewDirty =
    !!parsedJd && !!parsedJdDraft && JSON.stringify(parsedJdDraft) !== JSON.stringify(parsedJd.payload);
  const lockedNonDraftSelected = selectedRecord?.status === "PUBLISHED" || selectedRecord?.status === "CLOSED";
  const formDirty = lockedNonDraftSelected
    ? false
    : JSON.stringify(form) !== JSON.stringify(selectedRecord ? toForm(selectedRecord) : emptyJob);
  const leaveAttemptsRef = useRef(0);

  useEffect(() => {
    if (!reviewDirty && !formDirty && !saving) {
      leaveAttemptsRef.current = 0;
    }
  }, [reviewDirty, formDirty, saving]);

  useUnsavedChanges(reviewDirty || formDirty, (attempt = 1) => {
    const remaining = Math.max(1, 3 - attempt);
    setError(
      `Bạn còn thay đổi chưa lưu. Hãy lưu trước khi chuyển màn hình (bấm thêm ${remaining} lần nữa để bỏ thay đổi).`
    );
  });

  function canLeaveDraft(): boolean {
    if (saving) {
      setError("Bạn còn thay đổi chưa lưu hoặc đang xử lý. Vui lòng chờ lưu xong.");
      return false;
    }
    if (reviewDirty || formDirty) {
      leaveAttemptsRef.current += 1;
      if (leaveAttemptsRef.current >= 3) {
        leaveAttemptsRef.current = 0;
        setError(null);
        return true;
      }
      const remaining = 3 - leaveAttemptsRef.current;
      setError(
        `Bạn còn thay đổi chưa lưu hoặc đang xử lý. Hãy lưu trước khi đổi tin tuyển dụng (bấm thêm ${remaining} lần nữa để bỏ thay đổi).`
      );
      return false;
    }
    leaveAttemptsRef.current = 0;
    return true;
  }

  function selectWorkspaceTab(tab: WorkspaceTab) {
    setActiveTab(tab);
    if (selectedJobId) {
      rawNavigate(`${routes.recruiter.jobDetail(selectedJobId)}?tab=${tab}`, { replace: true });
    }
  }

  function selectJob(job: Job, targetTab: WorkspaceTab = "pipeline") {
    if (!canLeaveDraft()) return;
    if (companyId) {
      handledInitialJobRef.current = `${companyId}:${job.jobId}`;
    }
    setSelectedJobId(job.jobId);
    setSelectedRecord(job);
    setForm(toForm(job));
    setActiveTab(targetTab);
    setViewMode("workspace");
    setMessage(null);
    setError(null);
    rawNavigate(`${routes.recruiter.jobDetail(job.jobId)}?tab=${targetTab}`);
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
    rawNavigate(routes.recruiter.newJob);
  }

  function duplicateJob(job: Job) {
    if (!canLeaveDraft()) return;
    if (companyId && initialJobId) {
      handledInitialJobRef.current = `${companyId}:${initialJobId}`;
    }
    const base = toForm(job);
    const today = new Date().toISOString().slice(0, 10);
    setSelectedJobId(null);
    setSelectedRecord(null);
    setForm({
      ...base,
      title: `${base.title} (Bản sao)`.slice(0, 200),
      applicationDeadline: base.applicationDeadline && base.applicationDeadline < today ? "" : base.applicationDeadline
    });
    setActiveTab("editor");
    setViewMode("workspace");
    setParsedJd(null);
    setParsedJdDraft(null);
    setMessage("Đã tạo bản sao vào biểu mẫu. Kiểm tra nội dung rồi bấm “Tạo bản nháp” để lưu.");
    setError(null);
    rawNavigate(routes.recruiter.newJob);
  }

  function backToList() {
    if (!canLeaveDraft()) return;
    setViewMode("list");
    setSelectedJobId(null);
    setSelectedRecord(null);
    setForm(emptyJob);
    setMessage(null);
    setError(null);
    rawNavigate(routes.recruiter.jobs);
  }

  function updateForm<K extends keyof JobForm>(key: K, value: JobForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || saving) return;
    if (!richTextToPlainText(form.description).trim()) {
      setError("Vui lòng nhập Mô tả công việc.");
      return;
    }
    if (!richTextToPlainText(form.requirementsText).trim()) {
      setError("Vui lòng nhập Yêu cầu ứng viên.");
      return;
    }
    if (form.salaryMin && form.salaryMax && Number(form.salaryMin) > Number(form.salaryMax)) {
      setError("Lương tối thiểu không được lớn hơn lương tối đa.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    const payload = {
      ...form,
      category: { ...form.category, positionName: form.category.positionName || form.title },
      benefitsText: form.benefitsText || null,
      locationText: form.locationText || null,
      province: form.province.trim() || null,
      externalAiPolicyVersion: form.externalAiConsent ? externalAiPolicyVersion : null,
      countryCode: form.countryCode || null,
      workMode: form.workMode || null,
      employmentType: form.employmentType || null,
      seniorityLevel: form.seniorityLevel || null,
      salaryMin: form.salaryNegotiable ? null : (form.salaryMin ? Number(form.salaryMin) : null),
      salaryMax: form.salaryNegotiable ? null : (form.salaryMax ? Number(form.salaryMax) : null),
      salaryCurrency: form.salaryNegotiable ? null : (form.salaryMin || form.salaryMax ? form.salaryCurrency : null),
      salaryPeriod: form.salaryNegotiable ? null : (form.salaryMin || form.salaryMax ? form.salaryPeriod : null),
      applicationDeadline: form.applicationDeadline ? new Date(form.applicationDeadline).toISOString() : null,
      ...(selectedJobId ? { version: selectedRecord?.version } : {})
    };
    const targetCompanyId = selectedJobId ? companyId : (draftCompanyId ?? companyId);
    if (!targetCompanyId) return;
    try {
      const saved = await apiRequest<Job>(
        selectedJobId ? `/api/v2/jobs/${selectedJobId}` : `/api/v2/companies/${targetCompanyId}/jobs`,
        {
          method: selectedJobId ? "PUT" : "POST",
          accessToken: session.accessToken,
          body: JSON.stringify(payload)
        }
      );
      if (!selectedJobId && targetCompanyId !== companyId && onSelectCompany) {
        skipCompanyResetRef.current = true;
        onSelectCompany(targetCompanyId);
      }
      if (!selectedJobId && companyId) {
        handledInitialJobRef.current = `${targetCompanyId}:${saved.jobId}`;
      }
      setSelectedRecord(saved);
      results.refresh();
      setCountsTick((v) => v + 1);
      setSelectedJobId(saved.jobId);
      setForm(toForm(saved));
      setActiveTab("editor");
      setViewMode("workspace");
      setParsedJd(null);
      setParsedJdDraft(null);
      if (!selectedJobId) {
        rawNavigate(`${routes.recruiter.jobDetail(saved.jobId)}?tab=editor`, { replace: true });
      }
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
      if (action === "publish") {
        if (job.applicationDeadline && Date.parse(job.applicationDeadline) <= Date.now()) {
          setError("Hạn nhận hồ sơ đã qua. Hãy cập nhật hạn mới trước khi đăng tin.");
          setSaving(false);
          return;
        }
        if (job.matchingSupported !== false) {
          let currentParsedJd: ParsedJd;
          try {
            currentParsedJd = await apiRequest<ParsedJd>(`/api/v2/parsed-jds/${job.jobVersionId}`, {
              accessToken: session.accessToken
            });
          } catch (parsedError) {
            if (parsedError instanceof ApiClientError && parsedError.status === 404) {
              setError("Yêu cầu công việc đang được hệ thống phân tích. Hãy mở tab 'Kiểm tra yêu cầu' và xác nhận ParsedJD trước khi đăng tin.");
              return;
            }
            throw parsedError;
          }
          if (currentParsedJd.status !== "CONFIRMED") {
            setError("Cần review và xác nhận ParsedJD trước khi đăng JD.");
            return;
          }
        }
      }
      const updated = await apiRequest<Job>(`/api/v2/jobs/${job.jobId}/${action}?version=${job.version}`, {
        method: "POST",
        accessToken: session.accessToken
      });
      results.refresh();
      setCountsTick((v) => v + 1);
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
          companyCounts={companyCounts}
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
        <nav aria-label="Đường dẫn tin tuyển dụng" className="flex items-center gap-2 text-xs text-ink-500">
          <button
            type="button"
            onClick={backToList}
            className="font-medium text-ink-700 hover:text-brand-700 hover:underline cursor-pointer bg-transparent border-0 p-0"
          >
            Danh sách tin tuyển dụng
          </button>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-ink-900">
            {selectedRecord ? selectedRecord.title : "Tạo tin tuyển dụng mới"}
          </span>
        </nav>

        <main className="space-y-5">
          {selectedJobId && activeTab !== "editor" && activeTab !== "review" && (
            <>
              {message && <ErrorBanner tone="success" message={message} />}
              {error && <ErrorBanner tone="error" message={error} />}
            </>
          )}
          {selectedJob && (
            <header className="rounded-lg border border-border-subtle bg-white px-6 py-5 shadow-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                      JD Tuyển dụng
                    </span>
                    <Badge tone={jobStatusTone(selectedJob.status)}>{jobStatusLabel(selectedJob.status)}</Badge>
                    {selectedJob.matchingSupported === false && (
                      <Badge tone="info">Sàng lọc thủ công (Ngoài CNTT)</Badge>
                    )}
                    <span className="text-xs font-medium text-ink-500 tabular-nums-kpi">
                      v{selectedJob.jobVersionNumber}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-ink-900 m-0">{selectedJob.title}</h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-600">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPinIcon size={14} className="text-ink-400 shrink-0" aria-hidden="true" />
                      <span>{formatJobLocation(selectedJob, "full")}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CompanyIcon size={14} className="text-ink-400 shrink-0" aria-hidden="true" />
                      <span>{workModeLabel(selectedJob.workMode)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <UsersIcon size={14} className="text-ink-400 shrink-0" aria-hidden="true" />
                      <span>{selectedJob.openings} chỉ tiêu</span>
                    </span>
                    {salaryLabel && (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                        <BanknoteIcon size={14} className="text-emerald-600 shrink-0" aria-hidden="true" />
                        <span>{salaryLabel}</span>
                      </span>
                    )}
                  </div>
                </div>

                {canRecruit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedJob.status === "DRAFT" && (
                      <Button variant="primary" size="sm" disabled={!canPublish || saving} onClick={() => void changeState(selectedJob, "publish")}>
                        Đăng JD
                      </Button>
                    )}
                    {selectedJob.status === "PUBLISHED" && (
                      <Button variant="danger" size="sm" onClick={() => void changeState(selectedJob, "close")}>
                        Đóng JD
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-3">
                {[
                  { id: "pipeline" as const, label: "Ứng viên & Pipeline", Icon: UsersIcon },
                  { id: "analytics" as const, label: "Thống kê tin này", Icon: BarChartIcon },
                  { id: "editor" as const, label: "Chi tiết tin tuyển dụng", Icon: PencilIcon }
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      if (id === "editor" || canLeaveDraft()) selectWorkspaceTab(id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                      activeTab === id
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
                    )}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
                {selectedRecord?.matchingSupported !== false && (
                  <button
                    type="button"
                    onClick={() => {
                      if (formDirty) setError("Lưu tin tuyển dụng trước khi kiểm tra yêu cầu.");
                      else {
                        selectWorkspaceTab("review");
                        setError(null);
                      }
                    }}
                    className={cn(
                      "rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer",
                      activeTab === "review"
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
                    )}
                  >
                    Kiểm tra yêu cầu
                  </button>
                )}
              </div>
            </header>
          )}

          {(!selectedJob || selectedJob.status === "DRAFT") && (
            <nav
              aria-label="Tiến trình tạo và đăng tin"
              className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-white px-4 py-3"
            >
              {[
                { id: "editor" as const, num: 1, label: "Thông tin & Mô tả JD", enabled: true },
                {
                  id: "review" as const,
                  num: 2,
                  label:
                    selectedRecord?.matchingSupported === false
                      ? "Xét thủ công (Ngoài IT)"
                      : "Xác nhận tiêu chí AI",
                  enabled: Boolean(selectedRecord && selectedRecord.matchingSupported !== false)
                },
                {
                  id: "preview" as const,
                  num: 3,
                  label: "Xem trước & Đăng tin",
                  enabled: Boolean(selectedRecord)
                }
              ].map((step) => {
                const active = activeTab === step.id || (!selectedJobId && step.id === "editor");
                return (
                  <button
                    key={step.id}
                    type="button"
                    disabled={!step.enabled}
                    onClick={() => {
                      if (!step.enabled) return;
                      if (step.id !== "editor" && formDirty) {
                        setError("Lưu tin tuyển dụng trước khi chuyển sang bước tiếp theo.");
                        return;
                      }
                      setError(null);
                      selectWorkspaceTab(step.id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      active
                        ? "border-brand-600 bg-brand-50 text-brand-800"
                        : step.enabled
                          ? "border-border-subtle bg-white text-ink-700 hover:bg-slate-50 cursor-pointer"
                          : "border-border-subtle bg-slate-50 text-ink-400 cursor-not-allowed"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold",
                        active ? "bg-brand-600 text-white" : "bg-slate-200 text-ink-700"
                      )}
                    >
                      {step.num}
                    </span>
                    <span>{step.label}</span>
                  </button>
                );
              })}
            </nav>
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
              onRetryParsedJd={() => setParsedJdRefreshTick((v) => v + 1)}
            />
          )}

          {selectedRecord && activeTab === "preview" && (
            <Card padding="lg" className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 m-0">
                    Xem trước góc nhìn ứng viên
                  </p>
                  <h3 className="text-xl font-bold text-ink-900 m-0">{selectedRecord.title}</h3>
                  <p className="text-xs text-ink-500 m-0">
                    {formatJobLocation(selectedRecord, "full")} · {workModeLabel(selectedRecord.workMode)} ·{" "}
                    {salaryLabel || "Thỏa thuận"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={canPublish ? "success" : "warning"}>
                    {canPublish ? "Công ty ACTIVE" : "Công ty chờ duyệt"}
                  </Badge>
                  {selectedRecord.matchingSupported === false ? (
                    <Badge tone="info">Ngoài IT · Xét thủ công</Badge>
                  ) : (
                    <Badge tone={parsedJd?.status === "CONFIRMED" ? "success" : "warning"}>
                      {parsedJd?.status === "CONFIRMED" ? "AI JD đã xác nhận" : "AI JD chưa xác nhận"}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600 m-0">Mô tả công việc</h4>
                  <RichTextContent content={selectedRecord.description} className="text-ink-800" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600 m-0">Yêu cầu ứng viên</h4>
                  <RichTextContent content={selectedRecord.requirementsText} className="text-ink-800" />
                </div>
                {selectedRecord.benefitsText && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600 m-0">Quyền lợi</h4>
                    <RichTextContent content={selectedRecord.benefitsText} className="text-ink-800" />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setActiveTab(selectedRecord.matchingSupported === false ? "editor" : "review")
                  }
                >
                  ← Quay lại bước trước
                </Button>
                {canRecruit && selectedRecord.status === "DRAFT" && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!canPublish || saving}
                    onClick={() => void changeState(selectedRecord, "publish")}
                  >
                    Đăng tin tuyển dụng
                  </Button>
                )}
              </div>
            </Card>
          )}

          {(!selectedJobId || activeTab === "editor") && (
            <RecruiterJobEditor
              form={form}
              selectedJob={selectedJob}
              selectedJobId={selectedJobId}
              companyId={selectedJobId ? companyId : (draftCompanyId ?? companyId)}
              companyName={
                companies.find((c) => c.companyId === (selectedJobId ? companyId : (draftCompanyId ?? companyId)))
                  ?.displayName ?? companyName
              }
              companies={companies}
              onSelectDraftCompany={(nextId) => setDraftCompanyId(nextId)}
              session={session}
              canRecruit={canRecruit}
              canPublish={canPublish}
              saving={saving}
              message={message}
              error={error}
              onUpdateForm={updateForm}
              onSubmit={save}
              onChangeState={(job, action) => void changeState(job, action)}
              onDuplicate={duplicateJob}
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

export function RecruiterJobBoard(props: RecruiterJobBoardProps) {
  return (
    <EnsureRouter>
      <RecruiterJobBoardContent {...props} />
    </EnsureRouter>
  );
}
