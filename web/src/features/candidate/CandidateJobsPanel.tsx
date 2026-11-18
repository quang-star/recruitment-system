import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { PageResult, usePagedResource } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { CvPreviewModal } from "../../shared/components/CvPreviewModal";
import { JobsIcon, MapPinIcon } from "../../shared/components/Icon";
import { PageControls } from "../../shared/components/PageControls";
import { ReasonDialog } from "../../shared/components/ReasonDialog";
import { richTextToPlainText } from "../../shared/components/RichTextEditor";
import { getPendingJobId, setPendingJobId } from "../../shared/pendingApplication";
import { EnsureRouter, routes, useSafeNavigate } from "../../shared/router";
import { Badge, Button, Card, CardContent, EmptyState, ErrorBanner, Modal, PageHeader, Skeleton } from "../../shared/ui";
import { ApplicationMatch } from "../application/MatchBreakdown";
import { CategoryFilterValue, JobCategoryFilter, emptyCategoryFilter } from "../recruiter/JobCategoryFilter";
import { CandidateApplicationsSection } from "./CandidateApplicationsSection";
import { CandidateApplyModal } from "./CandidateApplyModal";
import {
  Application,
  Cv,
  Job,
  StatusChange,
  employmentTypeLabel,
  formatSalary,
  getErrorMessage,
  inputClass,
  workModeLabel
} from "./candidateJobTypes";

type Props = {
  session: AuthSession;
  initialJobId?: string;
  initialCvId?: string;
  initialCvVersionId?: string;
  applicationsOnly?: boolean;
  dialogOnly?: boolean;
  onOpenCvLibrary?: () => void;
  onClose?: () => void;
  onApplied?: (message: string) => void;
};

function CandidateJobsPanelInner({
  session,
  initialJobId,
  initialCvId,
  initialCvVersionId,
  applicationsOnly = false,
  dialogOnly = false,
  onOpenCvLibrary,
  onClose,
  onApplied
}: Props) {
  const navigate = useSafeNavigate();
  const [linkedApplicationId, setLinkedApplicationId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("application"));
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("application"));
  const [pendingJob, setPendingJob] = useState<Job | null>(null);
  const [missingInitialJobNotice, setMissingInitialJobNotice] = useState<string | null>(null);
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [loadingCvs, setLoadingCvs] = useState(false);
  const [cvLoadError, setCvLoadError] = useState<string | null>(null);
  const [cvLoadAttempt, setCvLoadAttempt] = useState(0);
  const [targetLoadAttempt, setTargetLoadAttempt] = useState(0);
  const [cvSelectionWarning, setCvSelectionWarning] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [cvId, setCvId] = useState(initialCvId ?? "");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [loadingInitialTarget, setLoadingInitialTarget] = useState(
    Boolean(initialJobId || (!dialogOnly && getPendingJobId()))
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, StatusChange[]>>({});
  const [workingApplicationId, setWorkingApplicationId] = useState<string | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<Application | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Application | null>(null);
  const [previewCv, setPreviewCv] = useState<{
    cvId: string;
    cvVersionId?: string;
    title?: string;
    filename?: string;
    page?: number;
  } | null>(null);
  const submissionKey = useRef(crypto.randomUUID());

  const [pendingTargetJobId] = useState<string | null>(() => initialJobId ?? (!dialogOnly ? getPendingJobId() : null));
  const [jobQuery, setJobQuery] = useState("");
  const [jobSort, setJobSort] = useState("newest");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterValue>(emptyCategoryFilter);

  const [appQuery, setAppQuery] = useState("");
  const [appSort, setAppSort] = useState("newest");
  const [appStatus, setAppStatus] = useState("");

  const jobResults = usePagedResource<Job>(
    applicationsOnly || dialogOnly ? null : "/api/v2/candidate/jobs",
    {
      q: jobQuery.trim(),
      sort: jobSort,
      industryId: categoryFilter.industryId,
      specializationId: categoryFilter.specializationId,
      positionId: categoryFilter.positionId
    },
    session.accessToken,
    8
  );

  const applicationResults = usePagedResource<Application>(
    dialogOnly ? null : "/api/v2/candidate/applications",
    {
      q: appQuery.trim(),
      sort: appSort,
      status: appStatus,
      applicationId: linkedApplicationId
    },
    session.accessToken,
    8
  );

  // Clear pending sessionStorage key immediately so leaving and returning never re-triggers stale prompts.
  useEffect(() => {
    if (!dialogOnly && getPendingJobId()) {
      setPendingJobId(null);
    }
  }, [dialogOnly]);

  // Load candidate CVs for application modal (skipped in applicationsOnly when modal isn't opened until needed).
  useEffect(() => {
    if (applicationsOnly && !pendingJob && !pendingTargetJobId) return;
    const controller = new AbortController();
    setLoadingCvs(true);
    setCvLoadError(null);
    void apiRequest<Cv[]>("/api/v2/cvs", { accessToken: session.accessToken, signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setCvs(items);
        const confirmed = items.filter((item) => item.activeVersion?.processingStatus === "CONFIRMED");
        if (initialCvId) {
          const preferred = confirmed.find((item) => item.cvId === initialCvId);
          if (!preferred) {
            setCvSelectionWarning("CV bạn chọn để đối chiếu hiện chưa được xác nhận. Vui lòng chọn CV khác bên dưới.");
            setCvId("");
          } else if (initialCvVersionId && preferred.activeVersion.cvVersionId !== initialCvVersionId) {
            setCvSelectionWarning("Phiên bản CV bạn vừa đối chiếu đã thay đổi. Vui lòng chọn lại CV bên dưới trước khi nộp.");
            setCvId("");
          } else {
            setCvSelectionWarning(null);
            setCvId(preferred.cvId);
          }
        } else if (confirmed.length > 0) {
          setCvSelectionWarning(null);
          setCvId((current) => (current && confirmed.some((c) => c.cvId === current) ? current : confirmed[0].cvId));
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setCvLoadError(getErrorMessage(failure));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCvs(false);
      });
    return () => controller.abort();
  }, [session.accessToken, applicationsOnly, pendingJob, pendingTargetJobId, initialCvId, initialCvVersionId, cvLoadAttempt]);

  // Load preselected target job from route prop or pending login redirect.
  useEffect(() => {
    if (!pendingTargetJobId) {
      setLoadingInitialTarget(false);
      return;
    }
    const controller = new AbortController();
    setLoadingInitialTarget(true);
    setError(null);
    void apiRequest<PageResult<Job>>(
      `/api/v2/candidate/jobs?jobId=${encodeURIComponent(pendingTargetJobId)}&page=0&size=1`,
      { accessToken: session.accessToken, signal: controller.signal }
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        const found = page.items[0];
        if (found) {
          setConsentAccepted(false);
          setCoverLetter("");
          submissionKey.current = crypto.randomUUID();
          setPendingJob(found);
          setMissingInitialJobNotice(null);
        } else {
          setPendingJob(null);
          setMissingInitialJobNotice("Vị trí bạn chọn hiện đã đóng hoặc không còn tuyển dụng.");
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(failure));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingInitialTarget(false);
      });
    return () => controller.abort();
  }, [pendingTargetJobId, session.accessToken, targetLoadAttempt]);

  // Enrich paged applications with match scores without blocking list render.
  useEffect(() => {
    if (dialogOnly) return;
    if (applicationResults.items.length === 0) {
      setApplications([]);
      return;
    }
    let active = true;
    setApplications(applicationResults.items.map((item) => ({ ...item, matchState: "loading" })));
    void Promise.all(
      applicationResults.items.map(async (application) => {
        if (application.matchingSupported === false || application.cvAccessGranted === false) {
          return { ...application, match: null };
        }
        try {
          const match = await apiRequest<ApplicationMatch>(`/api/v2/applications/${application.applicationId}/match`, {
            accessToken: session.accessToken
          });
          return { ...application, match, matchState: "ready" as const };
        } catch (failure) {
          return {
            ...application,
            match: null,
            matchState: failure instanceof ApiClientError && failure.status === 404 ? ("waiting" as const) : ("error" as const)
          };
        }
      })
    ).then((items) => {
      if (active) setApplications(items);
    });
    return () => {
      active = false;
    };
  }, [applicationResults.items, session.accessToken, dialogOnly]);

  // Auto-load status history when an application is expanded via notification deep link.
  useEffect(() => {
    if (dialogOnly || !selectedApplicationId || histories[selectedApplicationId]) return;
    if (!applications.some((item) => item.applicationId === selectedApplicationId)) return;
    const controller = new AbortController();
    void apiRequest<StatusChange[]>(`/api/v2/applications/${selectedApplicationId}/history`, {
      accessToken: session.accessToken,
      signal: controller.signal
    })
      .then((history) => {
        if (!controller.signal.aborted) {
          setHistories((current) => ({ ...current, [selectedApplicationId]: history }));
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [applications, dialogOnly, histories, selectedApplicationId, session.accessToken]);

  const confirmedCvs = cvs.filter((item) => item.activeVersion?.processingStatus === "CONFIRMED");
  const selectedCv = confirmedCvs.find((item) => item.cvId === cvId) ?? (cvSelectionWarning ? null : confirmedCvs[0] ?? null);

  function openApplyModal(job: Job) {
    setError(null);
    setConsentAccepted(false);
    setCoverLetter("");
    submissionKey.current = crypto.randomUUID();
    setPendingJob(job);
  }

  function closeApplyModal() {
    setPendingJob(null);
    setConsentAccepted(false);
    setMissingInitialJobNotice(null);
    onClose?.();
  }

  async function handleSubmitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingJob || !selectedCv || !consentAccepted) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("/api/v2/candidate/applications", {
        method: "POST",
        accessToken: session.accessToken,
        idempotencyKey: submissionKey.current,
        body: JSON.stringify({
          jobId: pendingJob.jobId,
          cvId: selectedCv.cvId,
          cvVersionId: selectedCv.activeVersion.cvVersionId,
          coverLetter: coverLetter.trim() || null,
          consentAccepted: true,
          policyVersion: "cv-sharing-v1"
        })
      });
      submissionKey.current = crypto.randomUUID();
      const successText = `Đã nộp hồ sơ ứng tuyển vào vị trí "${pendingJob.title}".`;
      setPendingJob(null);
      setConsentAccepted(false);
      setCoverLetter("");
      setMessage(successText);
      onApplied?.(successText);
      if (!dialogOnly) {
        applicationResults.refresh();
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function loadHistory(applicationId: string) {
    setWorkingApplicationId(applicationId);
    setError(null);
    try {
      const history = await apiRequest<StatusChange[]>(`/api/v2/applications/${applicationId}/history`, {
        accessToken: session.accessToken
      });
      setHistories((current) => ({ ...current, [applicationId]: history }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorkingApplicationId(null);
    }
  }

  function toggleApplicationDetail(applicationId: string) {
    if (selectedApplicationId === applicationId) {
      setSelectedApplicationId(null);
      return;
    }
    setSelectedApplicationId(applicationId);
    if (!histories[applicationId]) {
      void loadHistory(applicationId);
    }
  }

  async function revokeCvAccess(application: Application) {
    setWorkingApplicationId(application.applicationId);
    setError(null);
    try {
      await apiRequest<void>(`/api/v2/candidate/applications/${application.applicationId}/cv-access?version=${application.version}`, {
        method: "DELETE",
        accessToken: session.accessToken
      });
      setRevokeTarget(null);
      setMessage("Đã thu hồi quyền xem CV cho hồ sơ ứng tuyển này.");
      applicationResults.refresh();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorkingApplicationId(null);
    }
  }

  async function withdrawApplication(application: Application, reason: string) {
    setWorkingApplicationId(application.applicationId);
    setError(null);
    try {
      await apiRequest(`/api/v2/candidate/applications/${application.applicationId}/withdraw`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ version: application.version, reason })
      });
      setWithdrawTarget(null);
      setMessage("Đã rút hồ sơ ứng tuyển thành công.");
      applicationResults.refresh();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorkingApplicationId(null);
    }
  }

  const applyModal = (
    <CandidateApplyModal
      pendingJob={pendingJob}
      confirmedCvs={confirmedCvs}
      selectedCv={selectedCv}
      loadingCvs={loadingCvs}
      cvLoadError={cvLoadError}
      cvSelectionWarning={cvSelectionWarning}
      accessToken={session.accessToken}
      coverLetter={coverLetter}
      consentAccepted={consentAccepted}
      submitting={submitting}
      error={error}
      onClose={closeApplyModal}
      onSelectCv={(nextId) => {
        setCvId(nextId);
        setCvSelectionWarning(null);
      }}
      onCvConfirmed={(uploadedCv) => {
        setCvs((current) => [uploadedCv, ...current.filter((item) => item.cvId !== uploadedCv.cvId)]);
        setCvId(uploadedCv.cvId);
        setCvSelectionWarning(null);
        setError(null);
      }}
      onRetryLoadCvs={() => setCvLoadAttempt((v) => v + 1)}
      onOpenCvLibrary={onOpenCvLibrary ?? (() => navigate(routes.candidate.cv))}
      onCoverLetterChange={setCoverLetter}
      onConsentChange={setConsentAccepted}
      onPreviewCv={(cv) =>
        setPreviewCv({
          cvId: cv.cvId,
          cvVersionId: cv.activeVersion.cvVersionId,
          title: cv.title,
          filename: cv.activeVersion.originalFilename
        })
      }
      onSubmit={handleSubmitApplication}
    />
  );

  const previewModal = previewCv && (
    <CvPreviewModal
      open
      onClose={() => setPreviewCv(null)}
      title={previewCv.title ?? "Xem trước CV"}
      filename={previewCv.filename}
      downloadPath={
        previewCv.cvVersionId
          ? `/api/v2/cvs/${previewCv.cvId}/file?cvVersionId=${previewCv.cvVersionId}`
          : `/api/v2/cvs/${previewCv.cvId}/file`
      }
      accessToken={session.accessToken}
      page={previewCv.page}
    />
  );

  if (dialogOnly) {
    return (
      <>
        {loadingInitialTarget && (
          <Modal open onClose={closeApplyModal} title="Đang tải thông tin vị trí…" size="sm">
            <div className="py-6 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </Modal>
        )}
        {!loadingInitialTarget && missingInitialJobNotice && (
          <Modal open onClose={closeApplyModal} title="Không thể ứng tuyển" size="sm">
            <div className="pt-4 space-y-4">
              <ErrorBanner tone="info" message={missingInitialJobNotice} />
              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={closeApplyModal}>
                  Đóng
                </Button>
              </div>
            </div>
          </Modal>
        )}
        {!loadingInitialTarget && !pendingJob && !missingInitialJobNotice && error && (
          <Modal open onClose={closeApplyModal} title="Không tải được vị trí tuyển dụng" size="sm">
            <div className="pt-4 space-y-4">
              <ErrorBanner tone="error" message={error} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={closeApplyModal}>
                  Đóng
                </Button>
                <Button type="button" onClick={() => setTargetLoadAttempt((v) => v + 1)}>
                  Thử lại
                </Button>
              </div>
            </div>
          </Modal>
        )}
        {applyModal}
        {previewModal}
      </>
    );
  }

  return (
    <div className="space-y-8">
      {!applicationsOnly && (
        <section className="space-y-5">
          <PageHeader
            eyebrow="Cơ hội việc làm"
            title="Tìm việc làm"
            subtitle="Khám phá các vị trí đang tuyển dụng, kiểm tra độ phù hợp với CV đã xác nhận và nộp hồ sơ nhanh chóng."
            actions={
              <Button type="button" variant="secondary" size="sm" onClick={() => jobResults.refresh()}>
                Làm mới danh sách
              </Button>
            }
          />

          {missingInitialJobNotice && <ErrorBanner tone="info" message={missingInitialJobNotice} />}
          {message && <ErrorBanner tone="success" message={message} />}
          {error && <ErrorBanner tone="error" message={error} />}

          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                <label className="block space-y-1.5 text-xs font-semibold text-ink-700">
                  <span>Từ khóa vị trí hoặc kỹ năng</span>
                  <input
                    type="search"
                    value={jobQuery}
                    onChange={(event) => setJobQuery(event.target.value)}
                    placeholder="Ví dụ: Backend Java, React, Product…"
                    className={inputClass}
                  />
                </label>
                <label className="block space-y-1.5 text-xs font-semibold text-ink-700">
                  <span>Sắp xếp</span>
                  <select value={jobSort} onChange={(event) => setJobSort(event.target.value)} className={inputClass}>
                    <option value="newest">Mới nhất</option>
                    <option value="title">Theo tiêu đề A–Z</option>
                  </select>
                </label>
              </div>
              <div className="[&_.job-filters]:grid [&_.job-filters]:grid-cols-1 sm:[&_.job-filters]:grid-cols-3 [&_.job-filters]:gap-3 [&_.job-filters]:m-0 [&_label]:flex [&_label]:flex-col [&_label]:gap-1.5 [&_label]:text-xs [&_label]:font-semibold [&_label]:text-ink-700 [&_select]:h-10 [&_select]:rounded-xl [&_select]:border [&_select]:border-border-strong [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm [&_select]:font-normal [&_select]:text-ink-900">
                <JobCategoryFilter value={categoryFilter} onChange={setCategoryFilter} />
              </div>
            </CardContent>
          </Card>

          {jobResults.error && <ErrorBanner tone="error" message={jobResults.error} />}

          {jobResults.loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Skeleton className="h-44" />
              <Skeleton className="h-44" />
            </div>
          ) : jobResults.items.length === 0 ? (
            <EmptyState
              icon={<JobsIcon size={24} />}
              title="Chưa tìm thấy vị trí phù hợp"
              description="Thử mở rộng từ khóa hoặc đặt lại bộ lọc ngành nghề để xem thêm cơ hội việc làm."
              action={
                (jobQuery || categoryFilter.industryId) && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setJobQuery("");
                      setCategoryFilter(emptyCategoryFilter);
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobResults.items.map((job) => (
                  <Card key={job.jobId} interactive className="flex flex-col justify-between">
                    <CardContent className="pt-5 flex flex-col justify-between gap-4 flex-1">
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-bold text-ink-900 m-0 leading-snug">{job.title}</h3>
                          <Badge tone={job.matchingSupported === false ? "neutral" : "brand"} className="shrink-0">
                            {job.matchingSupported === false ? "Xét thủ công" : "AI Match"}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
                          {job.locationText && (
                            <span className="inline-flex items-center gap-1">
                              <MapPinIcon size={13} /> {job.locationText}
                            </span>
                          )}
                          {workModeLabel(job.workMode) && <Badge tone="neutral">{workModeLabel(job.workMode)}</Badge>}
                          {employmentTypeLabel(job.employmentType) && (
                            <Badge tone="neutral">{employmentTypeLabel(job.employmentType)}</Badge>
                          )}
                          <Badge tone="info">{formatSalary(job)}</Badge>
                        </div>

                        <p className="text-sm text-ink-600 line-clamp-2 m-0 leading-relaxed">
                          {richTextToPlainText(job.description)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border-subtle">
                        <span className="text-xs text-ink-500">Số lượng tuyển: {job.openings}</span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(routes.jobDetail(job.jobId))}
                          >
                            Xem chi tiết
                          </Button>
                          <Button type="button" size="sm" onClick={() => openApplyModal(job)}>
                            Ứng tuyển vị trí này
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <PageControls
                page={jobResults.page}
                size={jobResults.size}
                total={jobResults.total}
                loading={jobResults.loading}
                onPageChange={jobResults.setPage}
                label="Phân trang danh sách việc làm"
              />
            </div>
          )}
        </section>
      )}

      {linkedApplicationId && <Button variant="secondary" size="sm" onClick={() => {
        setLinkedApplicationId(null);
        navigate(routes.candidate.applications, { replace: true });
      }}>Xem tất cả hồ sơ ứng tuyển</Button>}
      <CandidateApplicationsSection
        applicationsOnly={applicationsOnly}
        applications={applications}
        histories={histories}
        selectedApplicationId={selectedApplicationId}
        workingApplicationId={workingApplicationId}
        page={applicationResults.page}
        size={applicationResults.size}
        total={applicationResults.total}
        loading={applicationResults.loading}
        error={applicationResults.error}
        missingInitialJobNotice={missingInitialJobNotice}
        message={message}
        bannerError={error}
        appQuery={appQuery}
        appStatus={appStatus}
        appSort={appSort}
        onAppQueryChange={setAppQuery}
        onAppStatusChange={setAppStatus}
        onAppSortChange={setAppSort}
        onPageChange={applicationResults.setPage}
        onRefresh={() => applicationResults.refresh()}
        onToggleDetail={toggleApplicationDetail}
        onOpenJobDetail={(jobId) => navigate(routes.jobDetail(jobId))}
        onPreviewCv={setPreviewCv}
        onRevokeCvAccess={setRevokeTarget}
        onWithdraw={setWithdrawTarget}
      />

      {applyModal}
      {previewModal}

      <ReasonDialog
        open={withdrawTarget !== null}
        title="Rút hồ sơ ứng tuyển"
        confirmLabel="Xác nhận rút hồ sơ"
        description="Rút hồ sơ và thu hồi quyền xem CV, điểm của nhà tuyển dụng. Lịch sử ứng tuyển được giữ lại; thao tác không thể hoàn tác."
        onCancel={() => setWithdrawTarget(null)}
        onConfirm={(reason) => {
          if (withdrawTarget) void withdrawApplication(withdrawTarget, reason);
        }}
      />

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Thu hồi quyền xem CV"
        confirmLabel="Xác nhận thu hồi"
        busy={workingApplicationId !== null}
        description="Nhà tuyển dụng sẽ không xem được CV hoặc điểm của hồ sơ này. Trạng thái và lịch sử ứng tuyển vẫn được giữ lại."
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) void revokeCvAccess(revokeTarget);
        }}
      />
    </div>
  );
}

/** Candidate jobs discovery + applications tracker wrapped with router fallback. */
export function CandidateJobsPanel(props: Props) {
  return (
    <EnsureRouter>
      <CandidateJobsPanelInner {...props} />
    </EnsureRouter>
  );
}
