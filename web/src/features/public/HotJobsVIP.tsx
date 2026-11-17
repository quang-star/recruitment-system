import { useState } from "react";
import { BanknoteIcon, BookmarkIcon, ClockIcon, MapPinIcon } from "../../shared/components/Icon";
import { Card, cn } from "../../shared/ui";
import { CompanyLogo } from "./CompanyLogo";
import { resolveCompanyMeta } from "./companyData";
import { extractSkillsFromJob, formatSalary, publishedLabel, workModeLabel } from "./jobPresentation";
import { PublicJob } from "./types";

type QuickFilter = "ALL" | "REMOTE" | "HYBRID" | "JUNIOR" | "SENIOR";

const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: "ALL", label: "Tất cả" },
  { id: "REMOTE", label: "Remote" },
  { id: "HYBRID", label: "Hybrid" },
  { id: "JUNIOR", label: "Junior / Fresher" },
  { id: "SENIOR", label: "Senior" }
];

type HotJobsVIPProps = {
  jobs: PublicJob[];
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
};

export function HotJobsVIP({ jobs, onSelectJob, onApplyJob }: HotJobsVIPProps) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("ALL");
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});

  if (!jobs.length) return null;

  const filteredJobs = jobs.filter((job) => {
    if (quickFilter === "ALL") return true;
    if (quickFilter === "REMOTE") return job.workMode === "REMOTE";
    if (quickFilter === "HYBRID") return job.workMode === "HYBRID";
    if (quickFilter === "JUNIOR") {
      return ["INTERN", "FRESHER", "JUNIOR"].includes((job.seniorityLevel ?? "").toUpperCase());
    }
    if (quickFilter === "SENIOR") {
      return ["SENIOR", "LEAD", "MANAGER"].includes((job.seniorityLevel ?? "").toUpperCase());
    }
    return true;
  });

  const vipJobs = filteredJobs.slice(0, 6);

  function toggleSaved(e: React.MouseEvent, jobId: string) {
    e.stopPropagation();
    setSavedIds((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  }

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink-900 m-0">
            Việc làm mới nhất
          </h2>
          <p className="text-sm text-ink-500 mt-1 mb-0">
            Những vị trí vừa được cập nhật và sẵn sàng tiếp nhận hồ sơ
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc nhanh việc làm mới nhất">
          {QUICK_FILTERS.map((filter) => {
            const active = quickFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={active}
                onClick={() => setQuickFilter(filter.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-700 font-semibold"
                    : "border-border-subtle bg-white text-ink-600 hover:border-border-strong hover:text-ink-900"
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {vipJobs.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-white p-6 text-center space-y-2">
          <p className="text-sm text-ink-600 m-0">
            Chưa có tin mới nhất khớp bộ lọc này trong nhóm nổi bật.
          </p>
          <button
            type="button"
            onClick={() => setQuickFilter("ALL")}
            className="text-xs font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer"
          >
            Xem lại tất cả tin mới nhất
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vipJobs.map((job) => {
            const company = resolveCompanyMeta(job.companyId, job.companyName);
            const skills = job.skills?.length
              ? job.skills.slice(0, 4)
              : extractSkillsFromJob(job.requirementsText, job.description, job.title).slice(0, 4);
            const isSaved = Boolean(savedIds[job.jobId]);

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
                className="group flex flex-col justify-between gap-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CompanyLogo
                      src={job.companyLogo || company.logo}
                      name={job.companyName || company.shortName}
                      className="h-11 w-11 rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-ink-500 m-0 truncate pt-0.5">
                          {job.companyName || company.shortName}
                        </p>
                        <button
                          type="button"
                          aria-label={isSaved ? "Bỏ lưu công việc" : "Lưu công việc"}
                          aria-pressed={isSaved}
                          onClick={(e) => toggleSaved(e, job.jobId)}
                          className={cn(
                            "shrink-0 rounded-md p-1 transition-colors cursor-pointer bg-transparent border-0",
                            isSaved
                              ? "text-brand-600"
                              : "text-ink-400 hover:text-ink-700 hover:bg-slate-100"
                          )}
                        >
                          <BookmarkIcon size={15} filled={isSaved} aria-hidden="true" />
                        </button>
                      </div>
                      <h3 className="text-base font-bold text-ink-900 group-hover:text-brand-700 transition-colors m-0 mt-0.5 leading-snug line-clamp-2">
                        {job.title}
                      </h3>
                      <p className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-emerald-700 m-0 mt-1.5">
                        <BanknoteIcon size={14} className="shrink-0 text-emerald-600" aria-hidden="true" />
                        <span>{formatSalary(job)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon size={13} className="text-ink-400" aria-hidden="true" />
                      <span className="truncate max-w-[140px]">{job.locationText || "Linh hoạt"}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon size={13} className="text-ink-400" aria-hidden="true" />
                      <span>{workModeLabel(job.workMode)}</span>
                    </span>
                  </div>

                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-md border border-border-subtle bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-ink-700"
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
                    className="rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 group-hover:border-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors cursor-pointer"
                  >
                    Ứng tuyển ngay
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
