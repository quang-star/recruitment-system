import { ReactNode } from "react";
import { JobsIcon, SearchIcon } from "../../shared/components/Icon";
import { PageControls } from "../../shared/components/PageControls";
import { Badge, Button, Card, EmptyState, ErrorBanner, Skeleton, cn } from "../../shared/ui";
import { CategoryFilterValue, JobCategoryFilter } from "./JobCategoryFilter";
import {
  extractJobSkills,
  formatJobSalary,
  Job,
  WorkspaceTab
} from "./recruiterJobTypes";

type JobListPaging = {
  page: number;
  size: number;
  total: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  refresh: () => void;
};

type Props = {
  jobs: Job[];
  paging: JobListPaging;
  canRecruit: boolean;
  canPublish: boolean;
  jobSearch: string;
  onJobSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  sort: string;
  onSortChange: (value: string) => void;
  categoryFilter: CategoryFilterValue;
  onCategoryFilterChange: (value: CategoryFilterValue) => void;
  message: string | null;
  error: string | null;
  onNewJob: () => void;
  onSelectJob: (job: Job, tab: WorkspaceTab) => void;
  onChangeState: (job: Job, action: "publish" | "close") => void;
};

function KpiTile({ label, value, tone }: { label: string; value: number; tone?: "default" | "success" | "warning" | "muted" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200/80 bg-amber-50/50 text-amber-900"
        : tone === "muted"
          ? "border-slate-200 bg-slate-50/80 text-ink-700"
          : "border-border-subtle bg-white text-ink-900";
  return (
    <div className={cn("rounded-xl border px-4 py-3.5 shadow-xs", toneClass)}>
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500">{label}</span>
      <strong className="mt-1 block text-2xl font-bold tabular-nums-kpi">{value}</strong>
    </div>
  );
}

function MetaChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-slate-50 px-2.5 py-1 text-xs font-medium text-ink-700">
      {children}
    </span>
  );
}

export function RecruiterJobList({
  jobs,
  paging,
  canRecruit,
  canPublish,
  jobSearch,
  onJobSearchChange,
  statusFilter,
  onStatusFilterChange,
  sort,
  onSortChange,
  categoryFilter,
  onCategoryFilterChange,
  message,
  error,
  onNewJob,
  onSelectJob,
  onChangeState
}: Props) {
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Recruiter ATS</p>
          <h2 className="text-xl sm:text-2xl font-bold text-ink-900 m-0 mt-0.5">
            Quản lý Tin tuyển dụng &amp; ATS
          </h2>
          <p className="text-sm text-ink-600 m-0 mt-1">
            Theo dõi trạng thái các vị trí tuyển dụng, pipeline ứng viên và phân tích chất lượng hồ sơ
          </p>
        </div>
        {canRecruit && (
          <Button variant="primary" size="md" onClick={onNewJob}>
            + Tạo JD mới
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="TỔNG TIN TUYỂN DỤNG" value={paging.total} />
        <KpiTile label="ĐANG ĐĂNG TUYỂN" value={jobs.filter((j) => j.status === "PUBLISHED").length} tone="success" />
        <KpiTile label="BẢN NHÁP" value={jobs.filter((j) => j.status === "DRAFT").length} tone="warning" />
        <KpiTile label="ĐÃ ĐÓNG" value={jobs.filter((j) => j.status === "CLOSED").length} tone="muted" />
      </div>

      <Card padding="md" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-[220px]">
            <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              className="h-10 w-full rounded-xl border border-border-strong bg-white pl-10 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Tìm kiếm theo chức danh, địa điểm, yêu cầu kỹ năng…"
              value={jobSearch}
              maxLength={200}
              onChange={(e) => onJobSearchChange(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(["ALL", "PUBLISHED", "DRAFT", "CLOSED"] as const).map((status) => {
              const active = statusFilter === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => onStatusFilterChange(status)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                    active
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-border-subtle bg-white text-ink-600 hover:border-border-strong hover:text-ink-900"
                  )}
                >
                  {status === "ALL"
                    ? "Tất cả"
                    : status === "PUBLISHED"
                      ? "Đang đăng"
                      : status === "DRAFT"
                        ? "Bản nháp"
                        : "Đã đóng"}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="ats-sort-select" className="text-xs font-semibold text-ink-600 whitespace-nowrap">
              Sắp xếp:
            </label>
            <select
              id="ats-sort-select"
              className="h-9 rounded-xl border border-border-strong bg-white px-3 text-xs font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={sort}
              onChange={(event) => onSortChange(event.target.value)}
            >
              <option value="newest">Cập nhật mới nhất</option>
              <option value="oldest">Cập nhật cũ nhất</option>
              <option value="title">Tên vị trí A–Z</option>
            </select>
          </div>
        </div>

        <div className="border-t border-border-subtle pt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <JobCategoryFilter value={categoryFilter} onChange={onCategoryFilterChange} />
          </div>
          <PageControls
            page={paging.page}
            size={paging.size}
            total={paging.total}
            loading={paging.loading}
            onPageChange={paging.setPage}
            label="Phân trang JD công ty"
          />
        </div>
      </Card>

      {paging.error && (
        <ErrorBanner
          tone="error"
          message={paging.error}
          action={
            <Button variant="secondary" size="sm" onClick={paging.refresh}>
              Thử lại
            </Button>
          }
        />
      )}
      {message && <ErrorBanner tone="success" message={message} />}
      {error && <ErrorBanner tone="error" message={error} />}

      {paging.loading ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-500 m-0">Đang tải danh sách tin tuyển dụng…</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<JobsIcon size={24} />}
          title="Chưa có tin tuyển dụng nào phù hợp"
          description="Bắt đầu tạo tin tuyển dụng mới để đăng tuyển và sàng lọc ứng viên thông minh với AI."
          action={
            canRecruit ? (
              <Button variant="primary" size="md" onClick={onNewJob}>
                + Tạo tin tuyển dụng đầu tiên
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((job) => {
            const isPublished = job.status === "PUBLISHED";
            const isDraft = job.status === "DRAFT";
            const formattedSalary = formatJobSalary(job);
            const skills = extractJobSkills(`${job.title} ${job.requirementsText}`);

            return (
              <article
                key={job.jobId}
                className="ats-job-card-rich flex flex-col justify-between rounded-2xl border border-border-subtle bg-white p-5 shadow-card transition-all hover:border-brand-300 hover:shadow-card-hover gap-4"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={isPublished ? "success" : isDraft ? "warning" : "neutral"}>
                          {isPublished ? "🟢 Đang tuyển" : isDraft ? "🟡 Bản nháp" : "⚪ Đã đóng"}
                        </Badge>
                        <Badge tone="neutral">v{job.jobVersionNumber}</Badge>
                        {job.matchingSupported === false && <Badge tone="info">Review thủ công</Badge>}
                      </div>
                      <button
                        type="button"
                        className="job-card-title-link block text-left text-base font-bold text-ink-900 hover:text-brand-700 cursor-pointer"
                        onClick={() => onSelectJob(job, "pipeline")}
                      >
                        <strong>{job.title}</strong>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {canRecruit && isDraft && (
                        <Button
                          variant="subtle"
                          size="sm"
                          title="Đăng tin tuyển dụng này"
                          disabled={!canPublish}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeState(job, "publish");
                          }}
                        >
                          🚀 Đăng tin
                        </Button>
                      )}
                      {canRecruit && isPublished && (
                        <Button
                          variant="secondary"
                          size="sm"
                          title="Đóng tin tuyển dụng"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeState(job, "close");
                          }}
                        >
                          🛑 Đóng tin
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <MetaChip>📍 {job.locationText ?? "Linh hoạt"}</MetaChip>
                    <MetaChip>🏢 {job.workMode ?? "Toàn thời gian"}</MetaChip>
                    <MetaChip>🎯 {job.openings} chỉ tiêu</MetaChip>
                    {formattedSalary && <MetaChip>💰 {formattedSalary}</MetaChip>}
                    {job.category?.industryName && <MetaChip>🏷️ {job.category.industryName}</MetaChip>}
                  </div>

                  {job.description && (
                    <p className="text-xs text-ink-600 line-clamp-2 leading-relaxed m-0">{job.description}</p>
                  )}

                  {skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {skills.slice(0, 5).map((s) => (
                        <Badge key={s} tone="brand">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                  <Button variant="primary" size="sm" onClick={() => onSelectJob(job, "pipeline")}>
                    👥 Ứng viên &amp; Pipeline
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onSelectJob(job, "analytics")}>
                    📊 Thống kê
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSelectJob(job, "editor")}>
                    ✏️ Chi tiết tin
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
