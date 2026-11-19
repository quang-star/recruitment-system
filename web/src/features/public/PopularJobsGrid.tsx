import { BanknoteIcon, BookmarkIcon, MapPinIcon } from "../../shared/components/Icon";
import { Card } from "../../shared/ui";
import { CompanyLogo } from "./CompanyLogo";
import { resolveCompanyMeta } from "./companyData";
import { formatJobLocation, formatSalary, workModeLabel } from "./jobPresentation";
import { useSavedJobs } from "./savedJobs";
import { PublicJob } from "./types";

type PopularJobsGridProps = {
  jobs: PublicJob[];
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
};

export function PopularJobsGrid({ jobs, onSelectJob, onApplyJob }: PopularJobsGridProps) {
  const { savedIds, toggleSaved } = useSavedJobs();
  if (!jobs.length) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-10">
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight text-ink-900 m-0">
          Thêm cơ hội cho bạn
        </h2>
        <p className="text-sm text-ink-500 mt-1 mb-0">
          Các vị trí đang mở tuyển bổ sung trên hệ thống
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.slice(0, 6).map((job) => {
          const company = resolveCompanyMeta(job.companyId, job.companyName);
          const isSaved = Boolean(savedIds[job.jobId]);
          return (
            <Card key={job.jobId} as="article" interactive padding="sm" className="flex flex-col justify-between gap-3">
              <div className="flex items-start gap-3">
                <CompanyLogo
                  src={job.companyLogo || company.logo}
                  name={job.companyName || company.shortName}
                  className="h-10 w-10 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-ink-900 m-0 leading-snug">
                    <button
                      type="button"
                      onClick={() => onSelectJob(job)}
                      className="text-left hover:text-brand-700 cursor-pointer bg-transparent border-0 p-0 font-bold text-ink-900 line-clamp-2"
                    >
                      {job.title}
                    </button>
                  </h3>
                  <p className="text-xs text-ink-500 m-0 mt-0.5 truncate">
                    {job.companyName || company.shortName}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={isSaved ? "Bỏ lưu công việc" : "Lưu công việc"}
                  aria-pressed={isSaved}
                  onClick={() => toggleSaved(job.jobId)}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                    isSaved
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-border-subtle bg-white text-ink-400 hover:text-brand-700 hover:border-brand-200"
                  }`}
                >
                  <BookmarkIcon size={15} filled={isSaved} aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle/70 text-sm">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                    <BanknoteIcon size={14} className="text-emerald-600 shrink-0" aria-hidden="true" />
                    <span>{formatSalary(job)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-ink-500">
                    <MapPinIcon size={13} aria-hidden="true" />
                    <span className="truncate max-w-[120px]">{formatJobLocation(job, "short", workModeLabel(job.workMode))}</span>
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`${job.title} — Ứng tuyển`}
                  onClick={() => onApplyJob(job)}
                  className="text-sm font-semibold text-brand-700 hover:text-brand-800 cursor-pointer bg-transparent border-0 p-0"
                >
                  Ứng tuyển →
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
