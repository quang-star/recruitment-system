import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import {
  BanknoteIcon,
  BookmarkIcon,
  ClockIcon,
  ExternalLinkIcon,
  JobsIcon,
  LayersIcon,
  MapPinIcon,
  UsersIcon
} from "../../shared/components/Icon";
import { RichTextContent } from "../../shared/components/RichTextEditor";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";
import { PreApplyMatchWidget } from "../application/PreApplyMatchWidget";
import { applicationStatusLabel } from "../candidate/candidateJobTypes";
import { CompanyCover } from "./CompanyCover";
import { CompanyLogo } from "./CompanyLogo";
import { CompanyInfo, resolveCompanyMeta } from "./companyData";
import {
  countryLabel,
  deadlineRemainingLabel,
  employmentTypeLabel,
  extractSkillsFromJob,
  formatSalary,
  formatSalaryWithPeriod,
  publishedLabel,
  seniorityLabel,
  workModeLabel
} from "./jobPresentation";
import { useSavedJobs } from "./savedJobs";
import { PublicJob } from "./types";

type Props = {
  job: PublicJob;
  company?: CompanyInfo;
  session?: AuthSession | null;
  onApply: (job: PublicJob, preferredCv?: { cvId: string; cvVersionId?: string }) => void;
  onSelectJob: (job: PublicJob) => void;
  onViewCompany: (companyId: string) => void;
  onRequireLogin: () => void;
  onOpenCvLibrary?: () => void;
  onViewApplication?: (applicationId: string) => void;
  applicationRefreshKey?: number;
};

type CompanySidebarProps = {
  meta: CompanyInfo;
  job: PublicJob;
  openJobsCount: number | null;
  onViewCompany: (companyId: string) => void;
};

function CompanyInfoSidebarCard({ meta, job, openJobsCount, onViewCompany }: CompanySidebarProps) {
  const companyLocation =
    meta.location && meta.location !== "Chưa có thông tin địa điểm"
      ? meta.location
      : job.locationText || "Linh hoạt";
  const country = countryLabel(meta.countryCode);
  const rows: Array<{ label: string; value: string }> = [
    ...(job.category?.industryName ? [{ label: "Ngành nghề", value: job.category.industryName }] : []),
    { label: "Quy mô công ty", value: meta.size },
    { label: "Địa điểm", value: companyLocation },
    ...(country ? [{ label: "Quốc gia", value: country }] : [])
  ];

  return (
    <Card padding="none" className="overflow-hidden">
      <CompanyCover src={meta.coverImage} className="h-24 w-full" />
      <div className="px-5 pb-5 -mt-7 relative space-y-4">
        <div className="space-y-2.5">
          <div className="inline-flex rounded-xl border-2 border-white bg-white shadow-card">
            <CompanyLogo
              src={job.companyLogo || meta.logo}
              name={meta.shortName || meta.name}
              className="h-14 w-14 rounded-lg"
              textClassName="text-sm font-bold"
            />
          </div>
          <h2 className="text-base font-bold text-brand-700 m-0 leading-snug break-words">
            {meta.shortName || meta.name}
          </h2>
        </div>

        <dl className="space-y-2.5 text-sm m-0">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-500 shrink-0">{row.label}</dt>
              <dd className="font-medium text-ink-900 text-right m-0 truncate">{row.value}</dd>
            </div>
          ))}
        </dl>

        {openJobsCount != null && openJobsCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <JobsIcon size={15} className="shrink-0" aria-hidden="true" />
            <span>{openJobsCount} việc làm đang tuyển</span>
          </div>
        )}

        <div className="pt-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => onViewCompany(meta.id)}
            className="w-full inline-flex items-center justify-center gap-1.5 py-1 text-sm font-semibold text-brand-700 hover:text-brand-800 bg-transparent border-0 cursor-pointer"
          >
            <span>Xem hồ sơ công ty</span>
            <ExternalLinkIcon size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function RelatedJobItem({ job, onSelectJob }: { job: PublicJob; onSelectJob: (job: PublicJob) => void }) {
  const shareParams = new URLSearchParams(window.location.search);
  shareParams.set("job", job.jobId);
  const shareHref = `${window.location.pathname}?${shareParams.toString()}`;

  return (
    <Card as="article" interactive padding="sm" className="group">
      <a
        href={shareHref}
        data-job-id={job.jobId}
        onClick={(event) => {
          event.preventDefault();
          onSelectJob(job);
        }}
        className="block space-y-1.5 no-underline text-inherit outline-none"
      >
        <h3 className="text-sm font-bold text-ink-900 group-hover:text-brand-700 transition-colors m-0 leading-snug line-clamp-2">
          {job.title}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold text-rose-700">
            <BanknoteIcon size={13} className="shrink-0" aria-hidden="true" />
            <span>{formatSalary(job)}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-ink-500">
            <MapPinIcon size={13} className="text-ink-400 shrink-0" aria-hidden="true" />
            <span>{job.locationText || "Linh hoạt"}</span>
          </span>
          <span className="text-ink-400">{publishedLabel(job)}</span>
        </div>
      </a>
    </Card>
  );
}

/** Public job detail view with Saramin-inspired scannable hierarchy, bookmark toggle, company sidebar, and AI pre-apply check. */
export function JobDetailPage({
  job,
  company,
  session = null,
  onApply,
  onSelectJob,
  onViewCompany,
  onRequireLogin,
  onOpenCvLibrary,
  onViewApplication,
  applicationRefreshKey = 0
}: Props) {
  const meta = company ?? resolveCompanyMeta(job.companyId, job.companyName);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [relatedJobs, setRelatedJobs] = useState<PublicJob[]>([]);
  const [relatedTotal, setRelatedTotal] = useState<number | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [relatedError, setRelatedError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [existingApplication, setExistingApplication] = useState<{ applicationId: string; status: string } | null>(null);
  const { savedIds, toggleSaved } = useSavedJobs();

  const isCandidate = Boolean(session?.roles?.includes("CANDIDATE"));
  const isSaved = Boolean(savedIds[job.jobId]);
  const skills = job.skills ?? extractSkillsFromJob(job.requirementsText, job.description, job.title);
  const remainingLabel = deadlineRemainingLabel(job.applicationDeadline);
  const locationSummary = job.locationText
    ? `${job.locationText} · ${workModeLabel(job.workMode)}`
    : workModeLabel(job.workMode);

  useEffect(() => { titleRef.current?.focus(); }, [job.jobId]);

  useEffect(() => {
    if (!isCandidate || !session?.accessToken) {
      setExistingApplication(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    void apiRequest<PageResult<{ applicationId: string; status: string }>>(
      `/api/v2/candidate/applications?jobId=${encodeURIComponent(job.jobId)}&page=0&size=1`,
      { accessToken: session.accessToken, signal: controller.signal }
    )
      .then((result) => {
        if (active) setExistingApplication(result.items?.[0] ?? null);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setExistingApplication(null);
      });
    return () => { active = false; controller.abort(); };
  }, [isCandidate, session?.accessToken, job.jobId, applicationRefreshKey]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setRelatedLoading(true);
    setRelatedError(false);
    void apiRequest<PageResult<PublicJob>>(
      `/api/v2/public/jobs?page=0&size=6&sort=newest&companyId=${encodeURIComponent(job.companyId)}`,
      { signal: controller.signal }
    )
      .then((result) => {
        if (!Array.isArray(result.items)) throw new Error("Invalid related jobs response");
        if (active) {
          setRelatedJobs(result.items);
          setRelatedTotal(typeof result.total === "number" ? result.total : null);
        }
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setRelatedJobs([]);
          setRelatedTotal(null);
          setRelatedError(true);
        }
      })
      .finally(() => {
        if (active) setRelatedLoading(false);
      });
    return () => { active = false; controller.abort(); };
  }, [job.companyId, job.jobId, attempt]);

  const others = relatedJobs.filter((item) => item.jobId !== job.jobId).slice(0, 5);
  const openJobsCount = relatedTotal ?? meta.openJobsCount;

  return (
    <div className="job-page mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-5">
          <Card as="article" padding="lg" aria-labelledby="job-page-title" className="space-y-4">
            <div className="space-y-2.5">
              <p className="lg:hidden text-xs font-semibold text-brand-700 m-0">
                {job.companyName || meta.shortName}
              </p>
              <h1
                id="job-page-title"
                ref={titleRef}
                tabIndex={-1}
                className="text-2xl sm:text-[26px] font-bold tracking-tight text-ink-900 leading-snug m-0 outline-none break-words"
              >
                {job.title}
              </h1>
              <div className="flex items-center gap-2 text-lg sm:text-xl font-bold text-rose-700">
                <BanknoteIcon size={20} className="shrink-0" aria-hidden="true" />
                <span>{formatSalaryWithPeriod(job)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon size={15} className="text-ink-400 shrink-0" aria-hidden="true" />
                <span>{locationSummary}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <LayersIcon size={15} className="text-ink-400 shrink-0" aria-hidden="true" />
                <span>{seniorityLabel(job.seniorityLevel)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={15} className="text-ink-400 shrink-0" aria-hidden="true" />
                <span>{employmentTypeLabel(job.employmentType)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon size={15} className="text-ink-400 shrink-0" aria-hidden="true" />
                <span>{job.openings} vị trí</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {skills.length > 0 && (
                <div aria-label="Kỹ năng trong tin tuyển dụng" className="flex flex-wrap gap-1.5">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-ink-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-ink-500 ml-auto">
                {remainingLabel && (
                  <span className="font-semibold text-ink-700">{remainingLabel}</span>
                )}
                {remainingLabel && <span aria-hidden="true">•</span>}
                <span>{publishedLabel(job)}</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {existingApplication ? (
                <>
                  <div className="flex flex-wrap items-center gap-3 flex-1">
                    <Badge tone="success">
                      Đã ứng tuyển · {applicationStatusLabel(existingApplication.status)}
                    </Badge>
                    {onViewApplication && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={() => onViewApplication(existingApplication.applicationId)}
                      >
                        Xem đơn ứng tuyển
                      </Button>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant={isSaved ? "subtle" : "secondary"}
                    size="lg"
                    aria-pressed={isSaved}
                    className="sm:min-w-[168px]"
                    onClick={() => toggleSaved(job.jobId)}
                  >
                    <BookmarkIcon size={17} filled={isSaved} aria-hidden="true" />
                    <span>{isSaved ? "Đã lưu tin" : "Lưu công việc"}</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="lg"
                    aria-label="Ứng tuyển vị trí này"
                    className="w-full sm:flex-[3]"
                    onClick={() => onApply(job)}
                  >
                    Ứng tuyển vị trí này
                  </Button>
                  <Button
                    type="button"
                    variant={isSaved ? "subtle" : "secondary"}
                    size="lg"
                    aria-pressed={isSaved}
                    className="w-full sm:flex-1 sm:min-w-[168px]"
                    onClick={() => toggleSaved(job.jobId)}
                  >
                    <BookmarkIcon size={17} filled={isSaved} aria-hidden="true" />
                    <span>{isSaved ? "Đã lưu tin" : "Lưu công việc"}</span>
                  </Button>
                </>
              )}
            </div>
          </Card>

          <Card as="article" padding="lg" aria-label="Nội dung tuyển dụng" className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-ink-900 m-0">Mô tả công việc</h2>
              <RichTextContent content={job.description} />
            </section>

            <section className="space-y-2 pt-4 border-t border-border-subtle">
              <h2 className="text-lg font-bold text-ink-900 m-0">Yêu cầu ứng viên</h2>
              <RichTextContent content={job.requirementsText} />
            </section>

            {job.benefitsText && (
              <section className="space-y-2 pt-4 border-t border-border-subtle">
                <h2 className="text-lg font-bold text-ink-900 m-0">Quyền lợi</h2>
                <RichTextContent content={job.benefitsText} />
              </section>
            )}
          </Card>

          <PreApplyMatchWidget
            job={job}
            session={session}
            onApplyJob={onApply}
            onRequireLogin={onRequireLogin}
            onOpenCvLibrary={onOpenCvLibrary}
            existingApplication={existingApplication}
            onViewApplication={onViewApplication}
          />
        </div>

        <aside aria-label="Thông tin công ty và việc làm liên quan" className="lg:col-span-1 space-y-5 lg:sticky lg:top-20">
          <CompanyInfoSidebarCard
            meta={meta}
            job={job}
            openJobsCount={openJobsCount}
            onViewCompany={onViewCompany}
          />

          <section aria-labelledby="job-page-related-title" className="space-y-3">
            <h2 id="job-page-related-title" className="text-base font-bold text-ink-900 m-0">
              Việc làm khác tại công ty
            </h2>
            {relatedLoading && <p className="text-xs text-ink-500 m-0">Đang tải vị trí liên quan…</p>}
            {relatedError && (
              <ErrorBanner
                tone="error"
                message="Chưa tải được vị trí khác."
                action={<Button type="button" size="sm" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Thử lại</Button>}
              />
            )}
            {!relatedLoading && !relatedError && others.length === 0 && (
              <p className="text-xs text-ink-500 m-0">Chưa có vị trí mở tuyển khác tại công ty này.</p>
            )}
            {!relatedLoading && !relatedError && others.length > 0 && (
              <div className="space-y-3">
                {others.map((other) => (
                  <RelatedJobItem key={other.jobId} job={other} onSelectJob={onSelectJob} />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
