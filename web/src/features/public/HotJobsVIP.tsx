import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { ArrowRightIcon, BanknoteIcon, BookmarkIcon, ClockIcon, MapPinIcon } from "../../shared/components/Icon";
import { Button, Card, EmptyState, ErrorBanner, Skeleton, cn } from "../../shared/ui";
import { CompanyLogo } from "./CompanyLogo";
import { resolveCompanyMeta } from "./companyData";
import { extractSkillsFromJob, formatJobLocation, formatSalary, publishedLabel, workModeLabel } from "./jobPresentation";
import { useSavedJobs } from "./savedJobs";
import { PublicJob } from "./types";

export type HomeExplorePreset = {
  mode?: string;
  sort?: string;
  level?: string;
};

type QuickFilter = "ALL" | "SALARY_DESC" | "REMOTE" | "HYBRID" | "JUNIOR" | "SAVED";

const QUICK_FILTERS: Array<{ id: QuickFilter; label: string }> = [
  { id: "ALL", label: "Tất cả" },
  { id: "SALARY_DESC", label: "Lương cao" },
  { id: "REMOTE", label: "Từ xa" },
  { id: "HYBRID", label: "Hybrid" },
  { id: "JUNIOR", label: "Thực tập / Junior" },
  { id: "SAVED", label: "Đã lưu" }
];

const SERVER_FILTER_QUERY: Partial<Record<QuickFilter, string>> = {
  SALARY_DESC: "/api/v2/public/jobs?page=0&size=12&sort=salary_desc",
  REMOTE: "/api/v2/public/jobs?page=0&size=12&sort=newest&workMode=REMOTE",
  HYBRID: "/api/v2/public/jobs?page=0&size=12&sort=newest&workMode=HYBRID",
  JUNIOR: "/api/v2/public/jobs?page=0&size=12&sort=newest&seniority=INTERN%7CFRESHER%7CJUNIOR"
};

const EXPLORE_PRESET_BY_FILTER: Partial<Record<QuickFilter, HomeExplorePreset>> = {
  SALARY_DESC: { sort: "salary_desc" },
  REMOTE: { mode: "REMOTE" },
  HYBRID: { mode: "HYBRID" },
  JUNIOR: { level: "JUNIOR" }
};

function enrichJob(job: PublicJob): PublicJob {
  const meta = resolveCompanyMeta(job.companyId, job.companyName);
  const skills =
    job.skills && job.skills.length > 0
      ? job.skills
      : extractSkillsFromJob(job.requirementsText, job.description, job.title);
  return {
    ...job,
    companyName: meta.shortName || job.companyName,
    companyLogo: job.companyLogo || meta.logo,
    skills
  };
}

type HotJobsVIPProps = {
  jobs: PublicJob[];
  totalJobs?: number;
  loadingJobs?: boolean;
  jobsError?: boolean;
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
  onExploreAll?: (preset?: HomeExplorePreset) => void;
};

export function HotJobsVIP({
  jobs,
  totalJobs,
  loadingJobs = false,
  jobsError = false,
  onSelectJob,
  onApplyJob,
  onExploreAll
}: HotJobsVIPProps) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("ALL");
  const { savedIds, toggleSaved: toggleSavedJob } = useSavedJobs();
  const [extraSavedJobs, setExtraSavedJobs] = useState<Record<string, PublicJob>>({});
  const [loadingSaved, setLoadingSaved] = useState(false);

  const [serverCache, setServerCache] = useState<
    Partial<Record<QuickFilter, { items: PublicJob[]; total: number }>>
  >({});
  const [loadingFilter, setLoadingFilter] = useState(false);
  const [filterError, setFilterError] = useState(false);
  const [filterAttempt, setFilterAttempt] = useState(0);

  const savedKeys = useMemo(
    () => Object.keys(savedIds).filter((id) => Boolean(savedIds[id])),
    [savedIds]
  );

  // Fetch filtered slice directly from the full public jobs catalog via API
  useEffect(() => {
    const queryPath = SERVER_FILTER_QUERY[quickFilter];
    if (!queryPath) {
      setLoadingFilter(false);
      setFilterError(false);
      return;
    }
    if (serverCache[quickFilter]) {
      setLoadingFilter(false);
      setFilterError(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoadingFilter(true);
    setFilterError(false);

    apiRequest<PageResult<PublicJob>>(queryPath, { signal: controller.signal })
      .then((res) => {
        if (!active) return;
        const items = Array.isArray(res.items) ? res.items.map(enrichJob) : [];
        const total = typeof res.total === "number" ? res.total : items.length;
        setServerCache((prev) => ({ ...prev, [quickFilter]: { items, total } }));
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setFilterError(true);
        }
      })
      .finally(() => {
        if (active) setLoadingFilter(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [quickFilter, serverCache, filterAttempt]);

  useEffect(() => {
    if (quickFilter !== "SAVED") return;
    const missing = savedKeys.filter((id) => !jobs.some((job) => job.jobId === id) && !extraSavedJobs[id]);
    if (!missing.length) return;
    let active = true;
    setLoadingSaved(true);
    Promise.all(
      missing.slice(0, 12).map((id) =>
        apiRequest<PageResult<PublicJob>>(`/api/v2/public/jobs?page=0&size=1&jobId=${encodeURIComponent(id)}`)
          .then((res) => (res.items[0] ? enrichJob(res.items[0]) : null))
          .catch(() => null)
      )
    )
      .then((found) => {
        if (!active) return;
        const map: Record<string, PublicJob> = {};
        for (const job of found) {
          if (job) map[job.jobId] = job;
        }
        if (Object.keys(map).length > 0) {
          setExtraSavedJobs((prev) => ({ ...prev, ...map }));
        }
      })
      .finally(() => {
        if (active) setLoadingSaved(false);
      });
    return () => {
      active = false;
    };
  }, [quickFilter, savedKeys, jobs, extraSavedJobs]);

  if (jobsError && !jobs.length && quickFilter === "ALL") return null;

  const savedJobsList = useMemo(
    () => [
      ...jobs.filter((job) => Boolean(savedIds[job.jobId])),
      ...savedKeys
        .filter((id) => !jobs.some((job) => job.jobId === id))
        .map((id) => extraSavedJobs[id])
        .filter((job): job is PublicJob => Boolean(job))
    ],
    [jobs, savedIds, savedKeys, extraSavedJobs]
  );

  const isServerFilter = Boolean(SERVER_FILTER_QUERY[quickFilter]);
  const cachedServerResult = serverCache[quickFilter];
  const activeLoading = quickFilter === "ALL" ? loadingJobs : isServerFilter ? loadingFilter : loadingSaved;

  const visibleJobs =
    quickFilter === "ALL"
      ? jobs
      : quickFilter === "SAVED"
        ? savedJobsList
        : (cachedServerResult?.items ?? []);

  const displayedCount =
    quickFilter === "ALL"
      ? (totalJobs ?? jobs.length)
      : quickFilter === "SAVED"
        ? savedJobsList.length
        : (cachedServerResult?.total ?? 0);

  const showCount =
    !activeLoading &&
    displayedCount > 0 &&
    (quickFilter === "ALL" ? !jobsError : isServerFilter ? !filterError : true);

  const countSuffix = quickFilter === "SAVED" ? "vị trí đã lưu" : "vị trí đang tuyển";

  return (
    <section
      aria-labelledby="home-latest-jobs-title"
      aria-busy={activeLoading}
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10"
    >
      <div className="mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="home-latest-jobs-title" className="text-xl font-bold tracking-tight text-ink-900 m-0">
              Việc làm mới nhất
            </h2>
            {showCount && (
              <span className="text-sm font-medium text-ink-500 tabular-nums-kpi">
                {displayedCount} {countSuffix}
              </span>
            )}
          </div>

          {onExploreAll && (
            <button
              type="button"
              onClick={() => onExploreAll(EXPLORE_PRESET_BY_FILTER[quickFilter])}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 cursor-pointer bg-transparent border-0 p-0"
            >
              <span>Xem tất cả việc làm</span>
              <ArrowRightIcon size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        {(jobs.length > 0 || quickFilter !== "ALL") && (
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
                    "rounded-md border px-2.5 py-1 text-xs sm:text-sm font-medium transition-colors cursor-pointer",
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
        )}
      </div>

      {activeLoading ? (
        <div className="space-y-4" role="status" aria-live="polite">
          <p className="text-sm text-ink-600 m-0">
            {quickFilter === "SAVED" ? "Đang tải việc làm đã lưu…" : "Đang cập nhật cơ hội việc làm…"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((item) => (
              <Card key={item} padding="md" className="space-y-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-11 w-11 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-3.5 w-2/3" />
              </Card>
            ))}
          </div>
        </div>
      ) : isServerFilter && filterError ? (
        <ErrorBanner
          tone="error"
          message="Chưa tải được danh sách việc làm cho bộ lọc này."
          action={
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setFilterAttempt((attempt) => attempt + 1)}
            >
              Thử lại
            </Button>
          }
        />
      ) : quickFilter === "ALL" && jobs.length === 0 ? (
        <EmptyState
          className="rounded-lg"
          title="Hiện chưa có vị trí đang tuyển"
          description="Hiện chưa có vị trí đang tuyển. Bạn có thể tạo hồ sơ để chuẩn bị cho cơ hội tiếp theo."
        />
      ) : visibleJobs.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-white p-6 text-center space-y-2">
          <p className="text-sm text-ink-600 m-0">
            {quickFilter === "SAVED"
              ? "Bạn chưa lưu vị trí nào."
              : "Hiện chưa có tin tuyển dụng phù hợp bộ lọc này."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
            <button
              type="button"
              onClick={() => setQuickFilter("ALL")}
              className="text-sm font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer"
            >
              Xem lại tất cả tin mới nhất
            </button>
            {onExploreAll && (
              <button
                type="button"
                onClick={() => onExploreAll()}
                className="text-sm font-semibold text-ink-700 hover:text-ink-900 underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer"
              >
                Tìm kiếm nâng cao
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleJobs.map((job) => {
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
                className="group flex flex-col justify-between gap-4 hover:bg-slate-50/70"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CompanyLogo
                      src={job.companyLogo || company.logo}
                      name={job.companyName || company.shortName}
                      className="h-11 w-11 rounded-md"
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
                          onClick={() => toggleSavedJob(job.jobId)}
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
                      <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5 leading-snug">
                        <button
                          type="button"
                          onClick={() => onSelectJob(job)}
                          className="text-left font-bold text-ink-900 cursor-pointer bg-transparent border-0 p-0 line-clamp-2 w-full"
                        >
                          {job.title}
                        </button>
                      </h3>
                      <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 m-0 mt-1.5">
                        <BanknoteIcon size={15} className="shrink-0 text-emerald-600" aria-hidden="true" />
                        <span>{formatSalary(job)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <MapPinIcon size={14} className="text-ink-400 shrink-0" aria-hidden="true" />
                      <span className="truncate max-w-[160px]">{formatJobLocation(job)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon size={14} className="text-ink-400 shrink-0" aria-hidden="true" />
                      <span>{workModeLabel(job.workMode)}</span>
                    </span>
                  </div>

                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-sm border border-border-subtle bg-slate-50 px-2 py-0.5 text-xs font-medium text-ink-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle/80">
                  <span className="text-xs sm:text-sm text-ink-500">{publishedLabel(job)}</span>
                  <button
                    type="button"
                    aria-label={`Ứng tuyển ${job.title}`}
                    onClick={() => onApplyJob(job)}
                    className="rounded-md border border-brand-200 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 hover:border-brand-600 hover:bg-brand-600 hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    Ứng tuyển
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
