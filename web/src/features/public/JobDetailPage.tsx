import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { ArrowLeftIcon, ClockIcon, CompanyIcon, MapPinIcon, UsersIcon } from "../../shared/components/Icon";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";
import { PreApplyMatchWidget } from "../application/PreApplyMatchWidget";
import { CompanyLogo } from "./CompanyLogo";
import { CompanyInfo, resolveCompanyMeta } from "./companyData";
import {
  employmentTypeLabel,
  extractSkillsFromJob,
  formatSalary,
  publishedLabel,
  seniorityLabel,
  workModeLabel
} from "./jobPresentation";
import { PublicJobListCard } from "./PublicJobListCard";
import { PublicJob } from "./types";

type Props = {
  job: PublicJob;
  company?: CompanyInfo;
  session?: AuthSession | null;
  onBack: () => void;
  onApply: (job: PublicJob) => void;
  onSelectJob: (job: PublicJob) => void;
  onViewCompany: (companyId: string) => void;
  onRequireLogin: () => void;
  onOpenCvLibrary?: () => void;
  backLabel?: string;
};

export function JobDetailPage({
  job,
  company,
  session = null,
  onBack,
  onApply,
  onSelectJob,
  onViewCompany,
  onRequireLogin,
  onOpenCvLibrary,
  backLabel = "Quay lại danh sách"
}: Props) {
  const meta = company ?? resolveCompanyMeta(job.companyId, job.companyName);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [relatedJobs, setRelatedJobs] = useState<PublicJob[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [relatedError, setRelatedError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const skills = job.skills ?? extractSkillsFromJob(job.requirementsText, job.description, job.title);
  const deadline = job.applicationDeadline ? Date.parse(job.applicationDeadline) : NaN;

  useEffect(() => { titleRef.current?.focus(); }, [job.jobId]);

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
        if (active) setRelatedJobs(result.items);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setRelatedJobs([]);
          setRelatedError(true);
        }
      })
      .finally(() => {
        if (active) setRelatedLoading(false);
      });
    return () => { active = false; controller.abort(); };
  }, [job.companyId, job.jobId, attempt]);

  const others = relatedJobs.filter((item) => item.jobId !== job.jobId).slice(0, 5);

  return (
    <div className="job-page mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <nav aria-label="Điều hướng chi tiết việc làm">
        <Button type="button" variant="secondary" size="md" onClick={onBack}>
          <ArrowLeftIcon size={16} aria-hidden="true" />
          <span>{backLabel}</span>
        </Button>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card as="article" padding="lg" aria-labelledby="job-page-title" className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <CompanyLogo
                src={job.companyLogo || meta.logo}
                name={job.companyName || meta.shortName}
                className="h-14 w-14 rounded-lg shadow-xs"
                textClassName="text-sm font-bold"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-semibold text-brand-700 m-0">
                  {job.companyName || meta.shortName}
                </p>
                <h1
                  id="job-page-title"
                  ref={titleRef}
                  tabIndex={-1}
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900 m-0 outline-none"
                >
                  {job.title}
                </h1>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge tone="brand">{formatSalary(job)}</Badge>
                  <Badge tone="neutral">{workModeLabel(job.workMode)}</Badge>
                  <Badge tone="neutral">{employmentTypeLabel(job.employmentType)}</Badge>
                  <Badge tone="neutral">{seniorityLabel(job.seniorityLevel)}</Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border-subtle bg-slate-50/80 px-4 py-3 text-xs sm:text-sm text-ink-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPinIcon size={15} className="text-ink-400" aria-hidden="true" />
                <span>{job.locationText || "Linh hoạt"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon size={15} className="text-ink-400" aria-hidden="true" />
                <span>{job.openings} vị trí cần tuyển</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ClockIcon size={15} className="text-ink-400" aria-hidden="true" />
                <span>{publishedLabel(job)}</span>
              </span>
              {Number.isFinite(deadline) && (
                <span>Hạn nộp: {new Date(deadline).toLocaleDateString("vi-VN")}</span>
              )}
            </div>

            {skills.length > 0 && (
              <div aria-label="Kỹ năng trong tin tuyển dụng" className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-lg border border-border-subtle bg-slate-50 px-2.5 py-1 text-xs font-semibold text-ink-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

            <div className="pt-1">
              <Button
                type="button"
                size="lg"
                aria-label="Ứng tuyển vị trí này"
                onClick={() => onApply(job)}
              >
                Ứng tuyển vị trí này
              </Button>
            </div>
          </Card>

          <Card as="article" padding="lg" aria-label="Nội dung tuyển dụng" className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-ink-900 m-0">Mô tả công việc</h2>
              <p className="text-sm text-ink-700 m-0 leading-relaxed whitespace-pre-line">{job.description}</p>
            </section>

            <section className="space-y-2 pt-4 border-t border-border-subtle">
              <h2 className="text-lg font-bold text-ink-900 m-0">Yêu cầu ứng viên</h2>
              <p className="text-sm text-ink-700 m-0 leading-relaxed whitespace-pre-line">{job.requirementsText}</p>
            </section>

            {job.benefitsText && (
              <section className="space-y-2 pt-4 border-t border-border-subtle">
                <h2 className="text-lg font-bold text-ink-900 m-0">Quyền lợi</h2>
                <p className="text-sm text-ink-700 m-0 leading-relaxed whitespace-pre-line">{job.benefitsText}</p>
              </section>
            )}
          </Card>

          <PreApplyMatchWidget
            job={job}
            session={session}
            onApplyJob={onApply}
            onRequireLogin={onRequireLogin}
            onOpenCvLibrary={onOpenCvLibrary}
          />
        </div>

        <aside aria-label="Thông tin công ty và việc làm liên quan" className="lg:col-span-1 space-y-5 lg:sticky lg:top-22">
          <Card padding="md" className="space-y-4">
            <div className="flex items-start gap-3">
              <img
                src={meta.logo}
                alt=""
                className="h-12 w-12 shrink-0 rounded-xl border border-border-subtle bg-white object-contain p-1.5"
                onError={(e) => { e.currentTarget.src = "/logos/smartrecruitment.svg"; }}
              />
              <div className="min-w-0">
                <h2 className="text-base font-bold text-ink-900 m-0 flex items-center gap-1.5">
                  <CompanyIcon size={16} className="text-brand-600 shrink-0" aria-hidden="true" />
                  <span className="truncate">{meta.shortName || meta.name}</span>
                </h2>
                <p className="text-xs text-ink-500 m-0 mt-0.5">{meta.size}</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-ink-600 m-0 line-clamp-3 leading-relaxed">
              {meta.description}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => onViewCompany(meta.id)}
            >
              Xem hồ sơ công ty
            </Button>
          </Card>

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
                  <PublicJobListCard key={other.jobId} job={other} onSelectJob={onSelectJob} showAction={false} />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
