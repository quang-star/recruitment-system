import { ClockIcon, MapPinIcon } from "../../shared/components/Icon";
import { Badge, Card } from "../../shared/ui";
import { resolveCompanyMeta } from "./companyData";
import { extractSkillsFromJob, formatSalary, publishedLabel, workModeLabel } from "./jobPresentation";
import { PublicJob } from "./types";

type HotJobsVIPProps = {
  jobs: PublicJob[];
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
};

export function HotJobsVIP({ jobs, onSelectJob, onApplyJob }: HotJobsVIPProps) {
  const vipJobs = jobs.slice(0, 6);
  if (!vipJobs.length) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink-900 m-0">
            Việc làm mới nhất
          </h2>
          <p className="text-sm text-ink-500 mt-1 mb-0">
            Những vị trí vừa được cập nhật và sẵn sàng tiếp nhận hồ sơ
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vipJobs.map((job) => {
          const company = resolveCompanyMeta(job.companyId, job.companyName);
          const skills = job.skills?.length
            ? job.skills.slice(0, 4)
            : extractSkillsFromJob(job.requirementsText, job.description, job.title).slice(0, 4);

          return (
            <Card
              key={job.jobId}
              as="article"
              interactive
              padding="md"
              role="button"
              tabIndex={0}
              onClick={() => onSelectJob(job)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelectJob(job);
                }
              }}
              className="flex flex-col justify-between gap-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <img
                    src={job.companyLogo || company.logo}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-xl border border-border-subtle bg-white object-contain p-1.5"
                    onError={(e) => { e.currentTarget.src = "/logos/smartrecruitment.svg"; }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-ink-500 m-0 truncate">
                        {job.companyName || company.shortName}
                      </p>
                      <Badge tone="brand">Đang tuyển</Badge>
                    </div>
                    <h3 className="text-base font-bold text-ink-900 m-0 mt-1 leading-snug line-clamp-2">
                      {job.title}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="brand">{formatSalary(job)}</Badge>
                  <span className="inline-flex items-center gap-1 text-ink-600">
                    <MapPinIcon size={13} className="text-ink-400" aria-hidden="true" />
                    <span className="truncate max-w-[140px]">{job.locationText || "Linh hoạt"}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-ink-600">
                    <ClockIcon size={13} className="text-ink-400" aria-hidden="true" />
                    <span>{workModeLabel(job.workMode)}</span>
                  </span>
                </div>

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-lg border border-border-subtle bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-ink-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle/80">
                <span className="text-xs text-ink-400">{publishedLabel(job)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApplyJob(job);
                  }}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 cursor-pointer"
                >
                  Ứng tuyển ngay
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
