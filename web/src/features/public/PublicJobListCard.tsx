import { ArrowRightIcon, BanknoteIcon, ClockIcon, MapPinIcon } from "../../shared/components/Icon";
import { Card } from "../../shared/ui";
import { CompanyLogo } from "./CompanyLogo";
import { resolveCompanyMeta } from "./companyData";
import { employmentTypeLabel, extractSkillsFromJob, formatSalary, publishedLabel, workModeLabel } from "./jobPresentation";
import { PublicJob } from "./types";

export function PublicJobListCard({
  job,
  onSelectJob,
  onSelectSkill,
  showAction = true,
}: {
  job: PublicJob;
  onSelectJob: (job: PublicJob) => void;
  onSelectSkill?: (skill: string) => void;
  showAction?: boolean;
}) {
  const company = resolveCompanyMeta(job.companyId, job.companyName);
  const skills = job.skills?.length
    ? job.skills.slice(0, 5)
    : extractSkillsFromJob(job.requirementsText, job.description, job.title).slice(0, 5);
  const shareParams = new URLSearchParams(window.location.search);
  shareParams.set("job", job.jobId);
  const shareHref = `${window.location.pathname}?${shareParams.toString()}`;

  return (
    <Card as="article" interactive padding="md" className="group">
      <a
        href={shareHref}
        data-job-id={job.jobId}
        onClick={(event) => {
          event.preventDefault();
          onSelectJob(job);
        }}
        className={`public-job-list-card flex ${showAction ? "flex-col sm:flex-row sm:items-center justify-between gap-4" : "w-full"} no-underline text-inherit outline-none`}
      >
        <div className="flex items-start gap-4 min-w-0 flex-1 w-full">
          <CompanyLogo
            src={job.companyLogo || company.logo}
            name={job.companyName || company.shortName}
            className="h-12 w-12 rounded-lg"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <h3 className="text-base font-bold text-ink-900 group-hover:text-brand-700 transition-colors m-0 leading-snug">
                {job.title}
              </h3>
              <p className="text-xs sm:text-sm font-medium text-ink-500 m-0 mt-0.5 truncate">
                {job.companyName || company.shortName}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-ink-600">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                <BanknoteIcon size={14} className="text-emerald-600 shrink-0" aria-hidden="true" />
                <span>{formatSalary(job)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPinIcon size={13} className="text-ink-400" aria-hidden="true" />
                <span>{job.locationText || "Linh hoạt"}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <ClockIcon size={13} className="text-ink-400" aria-hidden="true" />
                <span>{workModeLabel(job.workMode)} · {employmentTypeLabel(job.employmentType)}</span>
              </span>
              <span className="text-ink-400">{publishedLabel(job)}</span>
            </div>

            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {skills.map((skill) =>
                  onSelectSkill ? (
                    <button
                      key={skill}
                      type="button"
                      aria-label={`Lọc theo kỹ năng ${skill}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectSkill(skill);
                      }}
                      className="rounded-md border border-border-subtle bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors cursor-pointer"
                    >
                      {skill}
                    </button>
                  ) : (
                    <span
                      key={skill}
                      className="rounded-md border border-border-subtle bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-ink-700"
                    >
                      {skill}
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {showAction && (
          <div className="flex items-center justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border-subtle/70">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-3.5 py-2 text-xs font-semibold text-brand-700 group-hover:bg-brand-600 group-hover:text-white group-hover:border-brand-600 transition-colors whitespace-nowrap">
              <span>Xem chi tiết</span>
              <ArrowRightIcon size={14} aria-hidden="true" />
            </span>
          </div>
        )}
      </a>
    </Card>
  );
}
