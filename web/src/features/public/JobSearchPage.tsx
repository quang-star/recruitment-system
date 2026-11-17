import { useEffect, useRef, useState } from "react";
import { usePagedResource } from "../../shared/api/pagination";
import { SearchIcon } from "../../shared/components/Icon";
import { PageControls } from "../../shared/components/PageControls";
import { useUrlParams } from "../../shared/navigation";
import { Badge, Button, Card, EmptyState, ErrorBanner } from "../../shared/ui";
import { SALARY_FILTER_OPTIONS } from "./jobSearchFilters";
import { PublicJobListCard } from "./PublicJobListCard";
import { JobDiscovery, PublicJob } from "./types";

const QUICK_KEYWORDS = ["Java", "React", "TypeScript", "Kubernetes", "Python"];

type Props = {
  discovery: JobDiscovery;
  onSelectJob: (job: PublicJob) => void;
  restoreFocusJobId?: string | null;
  onFocusRestored?: () => void;
};

export function JobSearchPage({ discovery, onSelectJob, restoreFocusJobId, onFocusRestored }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  const { params, navigate } = useUrlParams();
  const keyword = params.get("q") ?? "";
  const [draftKeyword, setDraftKeyword] = useState(keyword);
  const [showAdvancedMobile, setShowAdvancedMobile] = useState(false);
  useEffect(() => { setDraftKeyword(keyword); }, [keyword]);

  const location = params.get("location") ?? "";
  const mode = params.get("mode") ?? "";
  const level = params.get("level") ?? "";
  const type = params.get("type") ?? "";
  const salary = params.get("salary") ?? "";
  const industry = params.get("industry") ?? "";
  const specialization = params.get("specialization") ?? "";
  const sort = params.get("sort") === "salary_desc" ? "salary_desc" : "newest";
  const categoryValue = industry ? `${industry}:${specialization}` : "";
  const categories = discovery.categories.map((category) => ({
    ...category,
    value: `${category.industryId}:${category.specializationId ?? ""}`
  }));
  const salaryRange = SALARY_FILTER_OPTIONS[salary];

  const updateFilter = (key: string, value: string) => navigate({ [key]: value || null, page: null, job: null });

  const resetFilters = () => {
    setDraftKeyword("");
    navigate({
      q: null, location: null, mode: null, level: null, type: null,
      salary: null, industry: null, specialization: null, sort: null, page: null, job: null
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftKeyword !== keyword) updateFilter("q", draftKeyword);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [draftKeyword, keyword]);

  const results = usePagedResource<PublicJob>(
    "/api/v2/public/jobs",
    {
      q: keyword,
      industryId: industry,
      specializationId: specialization,
      location,
      workMode: mode,
      seniority: level,
      employmentType: type,
      minSalary: salaryRange?.min,
      maxSalary: salaryRange?.max,
      sort
    },
    undefined,
    12,
    {
      page: Math.min(10000, Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0)),
      onChange: (page) => navigate({ page: page ? String(page) : null, job: null })
    }
  );

  useEffect(() => {
    if (!restoreFocusJobId || results.loading) return;
    const links = pageRef.current?.querySelectorAll<HTMLAnchorElement>(".public-job-list-card") ?? [];
    const target = Array.from(links).find((node) => node.dataset.jobId === restoreFocusJobId);
    if (target) target.focus();
    onFocusRestored?.();
  }, [restoreFocusJobId, results.loading, results.items, onFocusRestored]);

  const activeCategoryName = categories.find((item) => item.value === categoryValue)?.name;
  const chips: Array<{ key: string; name: string; label: string }> = [
    ...(keyword ? [{ key: "q", name: "bộ lọc từ khóa", label: `Từ khóa: ${keyword}` }] : []),
    ...(categoryValue ? [{ key: "category", name: "bộ lọc nhóm nghề", label: `Ngành: ${activeCategoryName ?? categoryValue}` }] : []),
    ...(location ? [{ key: "location", name: "bộ lọc địa điểm", label: `Địa điểm: ${location}` }] : []),
    ...(salaryRange ? [{ key: "salary", name: "bộ lọc mức lương", label: `Lương: ${salaryRange.label}` }] : []),
    ...(level ? [{ key: "level", name: "bộ lọc cấp bậc", label: `Cấp bậc: ${level}` }] : []),
    ...(mode ? [{ key: "mode", name: "bộ lọc chế độ làm việc", label: `Chế độ: ${mode}` }] : []),
    ...(type ? [{ key: "type", name: "bộ lọc hình thức làm việc", label: `Hình thức: ${type}` }] : [])
  ];

  const activeAdvancedCount = [salary, level, mode, type].filter(Boolean).length;

  const selectClass = (active = false, tall = false) =>
    `${tall ? "h-10" : "h-9"} w-full rounded-xl border px-3 text-xs sm:text-sm transition-colors focus:border-brand-600 focus:outline-none ${
      active
        ? "border-brand-500 bg-brand-50/70 font-semibold text-brand-800"
        : "border-border-strong bg-white text-ink-900"
    }`;

  const clearKeyword = () => {
    setDraftKeyword("");
    updateFilter("q", "");
  };

  return (
    <div ref={pageRef} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <section aria-labelledby="job-search-title" className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0 mb-1">
              Tìm kiếm cơ hội
            </p>
            <h1 id="job-search-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900 m-0">
              Tìm việc làm đang tuyển
            </h1>
          </div>
          {chips.length > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={resetFilters}>
              Xóa bộ lọc
            </Button>
          )}
        </div>

        <Card padding="md" className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            <form
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                updateFilter("q", draftKeyword);
              }}
              className="sm:col-span-2 lg:col-span-6 flex items-center gap-2"
            >
              <div className="relative flex-1 min-w-0">
                <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" aria-hidden="true" />
                <input
                  aria-label="Tìm kiếm việc làm"
                  placeholder="Vị trí, kỹ năng hoặc tên công ty"
                  value={draftKeyword}
                  maxLength={200}
                  onChange={(event) => setDraftKeyword(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border-strong bg-white pl-10 pr-8 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none"
                />
                {draftKeyword && (
                  <button
                    type="button"
                    aria-label="Xóa từ khóa"
                    onClick={clearKeyword}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-400 hover:bg-slate-100 hover:text-ink-700 cursor-pointer bg-transparent border-0 p-0 text-sm leading-none"
                  >
                    ×
                  </button>
                )}
              </div>
              <Button type="submit" variant="primary" size="md" className="h-10 shrink-0 px-4">
                Tìm kiếm
              </Button>
            </form>

            <div className="lg:col-span-3">
              <select
                aria-label="Lọc theo nhóm nghề"
                value={categoryValue}
                onChange={(event) => {
                  const category = categories.find((item) => item.value === event.target.value);
                  navigate({
                    industry: category?.industryId ?? null,
                    specialization: category?.specializationId ?? null,
                    page: null,
                    job: null
                  });
                }}
                className={selectClass(Boolean(categoryValue), true)}
              >
                <option value="">Tất cả nhóm nghề</option>
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <select
                aria-label="Địa điểm"
                value={location}
                onChange={(event) => updateFilter("location", event.target.value)}
                className={selectClass(Boolean(location), true)}
              >
                <option value="">Tất cả địa điểm</option>
                {discovery.locations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Gợi ý từ khóa nhanh">
              <span className="text-[11px] font-medium text-ink-500 mr-0.5">Phổ biến:</span>
              {QUICK_KEYWORDS.map((tag) => {
                const isSelected = keyword.trim().toLowerCase() === tag.toLowerCase();
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        clearKeyword();
                      } else {
                        setDraftKeyword(tag);
                        updateFilter("q", tag);
                      }
                    }}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "border-brand-500 bg-brand-600 text-white"
                        : "border-border-subtle bg-slate-50 text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-expanded={showAdvancedMobile}
              onClick={() => setShowAdvancedMobile((prev) => !prev)}
              className="sm:hidden inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 cursor-pointer"
            >
              <span>{showAdvancedMobile ? "Ẩn bộ lọc" : "Bộ lọc nâng cao"}</span>
              {activeAdvancedCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {activeAdvancedCount}
                </span>
              )}
            </button>
          </div>

          <div className={`${showAdvancedMobile ? "grid" : "hidden sm:grid"} grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border-subtle/70`}>
            <label data-active={Boolean(salary)} className="block space-y-1 text-xs font-medium text-ink-600">
              <span>Mức lương</span>
              <select aria-label="Lọc theo mức lương" value={salary} onChange={(event) => updateFilter("salary", event.target.value)} className={selectClass(Boolean(salary))}>
                <option value="">Tất cả</option>
                {Object.entries(SALARY_FILTER_OPTIONS).map(([key, item]) => (
                  <option key={key} value={key}>{item.label}</option>
                ))}
              </select>
            </label>

            <label data-active={Boolean(level)} className="block space-y-1 text-xs font-medium text-ink-600">
              <span>Cấp bậc</span>
              <select aria-label="Lọc theo cấp bậc" value={level} onChange={(event) => updateFilter("level", event.target.value)} className={selectClass(Boolean(level))}>
                <option value="">Tất cả</option>
                <option value="INTERN">Thực tập</option>
                <option value="FRESHER">Fresher</option>
                <option value="JUNIOR">Junior</option>
                <option value="MIDDLE">Chuyên viên</option>
                <option value="SENIOR">Senior</option>
                <option value="LEAD">Trưởng nhóm</option>
                <option value="MANAGER">Quản lý</option>
              </select>
            </label>

            <label data-active={Boolean(mode)} className="block space-y-1 text-xs font-medium text-ink-600">
              <span>Chế độ làm việc</span>
              <select aria-label="Lọc theo chế độ làm việc" value={mode} onChange={(event) => updateFilter("mode", event.target.value)} className={selectClass(Boolean(mode))}>
                <option value="">Tất cả</option>
                <option value="ONSITE">Tại văn phòng</option>
                <option value="HYBRID">Hybrid</option>
                <option value="REMOTE">Từ xa</option>
              </select>
            </label>

            <label data-active={Boolean(type)} className="block space-y-1 text-xs font-medium text-ink-600">
              <span>Hình thức</span>
              <select aria-label="Lọc theo hình thức làm việc" value={type} onChange={(event) => updateFilter("type", event.target.value)} className={selectClass(Boolean(type))}>
                <option value="">Tất cả</option>
                <option value="FULL_TIME">Toàn thời gian</option>
                <option value="PART_TIME">Bán thời gian</option>
                <option value="CONTRACT">Hợp đồng</option>
                <option value="INTERNSHIP">Thực tập</option>
              </select>
            </label>
          </div>

          {chips.length > 0 && (
            <div aria-label="Bộ lọc đang áp dụng" className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle">
              <span className="text-xs font-medium text-ink-500">Đang tìm:</span>
              {chips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    aria-label={`Xóa ${chip.name}`}
                    onClick={() => chip.key === "category"
                      ? navigate({ industry: null, specialization: null, page: null, job: null })
                      : chip.key === "q"
                      ? (() => { setDraftKeyword(""); updateFilter("q", ""); })()
                      : updateFilter(chip.key, "")}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-200 text-brand-800 cursor-pointer bg-transparent border-0 p-0"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="job-search-results-title" aria-busy={results.loading} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 id="job-search-results-title" className="text-lg font-bold text-ink-900 m-0">
              Kết quả phù hợp
            </h2>
            <Badge tone="neutral">{results.total} việc làm</Badge>
          </div>

          <div aria-label="Sắp xếp kết quả" className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="text-ink-500">Sắp xếp:</span>
            <select
              aria-label="Sắp xếp danh sách việc làm"
              value={sort}
              onChange={(e) => updateFilter("sort", e.target.value === "newest" ? "" : e.target.value)}
              className="h-9 rounded-xl border border-border-strong bg-white px-3 text-xs sm:text-sm font-medium text-ink-800 focus:border-brand-600 focus:outline-none"
            >
              <option value="newest">Mới nhất</option>
              <option value="salary_desc">Lương cao đến thấp</option>
            </select>
          </div>
        </div>

        {results.error ? (
          <ErrorBanner
            tone="error"
            message={results.error}
            action={<Button type="button" size="sm" variant="secondary" onClick={results.refresh}>Thử lại</Button>}
          />
        ) : results.loading ? (
          <div className="space-y-3" role="status" aria-label="Đang tải danh sách việc làm">
            <span className="sr-only">Đang tải danh sách việc làm…</span>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-28 rounded-xl border border-border-subtle bg-white p-4 animate-pulse"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-lg bg-slate-200 shrink-0" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-4 w-2/5 rounded bg-slate-200" />
                    <div className="h-3 w-1/4 rounded bg-slate-100" />
                    <div className="h-3 w-3/5 rounded bg-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : results.items.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={24} />}
            title="Chưa tìm thấy việc làm phù hợp"
            description="Thử từ khóa khác hoặc mở rộng bộ lọc để tìm thêm cơ hội."
            action={
              <Button type="button" variant="secondary" onClick={resetFilters}>
                Đặt lại bộ lọc
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {results.items.map((job) => (
              <PublicJobListCard
                key={job.jobId}
                job={job}
                onSelectJob={onSelectJob}
                onSelectSkill={(skill) => {
                  setDraftKeyword(skill);
                  updateFilter("q", skill);
                }}
              />
            ))}
          </div>
        )}

        {!results.loading && !results.error && results.total > 0 && (
          <PageControls
            {...results}
            onPageChange={(page) => {
              results.setPage(page);
              document.getElementById("job-search-results-title")?.scrollIntoView({ behavior: "smooth" });
            }}
            label="Phân trang tìm việc"
          />
        )}
      </section>
    </div>
  );
}
