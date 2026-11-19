import {
  BarChartIcon,
  JobsIcon,
  PencilIcon,
  SearchIcon,
  UsersIcon
} from "../../shared/components/Icon";
import { PageControls } from "../../shared/components/PageControls";
import { Badge, Button, Card, EmptyState, ErrorBanner, Skeleton, cn } from "../../shared/ui";
import { formatJobLocation, workModeLabel } from "../public/jobPresentation";
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

type CompanyJobCounts = {
  jobs?: number;
  publishedJobs?: number;
  draftJobs?: number;
  closedJobs?: number;
};

type Props = {
  jobs: Job[];
  paging: JobListPaging;
  companyCounts?: CompanyJobCounts | null;
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
  const dotClass =
    tone === "success"
      ? "bg-emerald-600"
      : tone === "warning"
        ? "bg-amber-500"
        : tone === "muted"
          ? "bg-slate-400"
          : "bg-brand-600";
  return (
    <div className="rounded-lg border border-border-subtle bg-white px-4 py-3">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)} aria-hidden="true" />
        <span>{label}</span>
      </span>
      <strong className="mt-1 block text-xl font-bold text-ink-900 tabular-nums-kpi">{value}</strong>
    </div>
  );
}

export function RecruiterJobList({
  jobs,
  paging,
  companyCounts,
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
          <h2 className="text-xl sm:text-2xl font-bold text-ink-900 m-0">
            Tin tuyển dụng
          </h2>
          <p className="text-sm text-ink-600 m-0 mt-1">
            Theo dõi trạng thái các vị trí tuyển dụng, tiến trình ứng viên và phân tích hồ sơ
          </p>
        </div>
        {canRecruit && (
          <Button variant="primary" size="md" onClick={onNewJob}>
            + Tạo JD mới
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Tổng tin tuyển dụng" value={companyCounts?.jobs ?? paging.total} />
        <KpiTile label="Đang đăng tuyển" value={companyCounts?.publishedJobs ?? jobs.filter((j) => j.status === "PUBLISHED").length} tone="success" />
        <KpiTile label="Bản nháp" value={companyCounts?.draftJobs ?? jobs.filter((j) => j.status === "DRAFT").length} tone="warning" />
        <KpiTile label="Đã đóng" value={companyCounts?.closedJobs ?? jobs.filter((j) => j.status === "CLOSED").length} tone="muted" />
      </div>

      <Card padding="md" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-[220px]">
            <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              className="h-9 w-full rounded-md border border-border-strong bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
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
                    "rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
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
              className="h-9 rounded-md border border-border-strong bg-white px-3 text-xs font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              value={sort}
              onChange={(event) => onSortChange(event.target.value)}
            >
              <option value="newest">Cập nhật mới nhất</option>
              <option value="oldest">Cập nhật cũ nhất</option>
              <option value="title">Tên vị trí A–Z</option>
            </select>
          </div>
        </div>

        <div className="border-t border-border-subtle pt-3">
          <JobCategoryFilter value={categoryFilter} onChange={onCategoryFilterChange} />
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
          <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-white">
            <div className="p-4"><Skeleton className="h-12 w-full" /></div>
            <div className="p-4"><Skeleton className="h-12 w-full" /></div>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<JobsIcon size={24} />}
          title="Chưa có tin tuyển dụng nào phù hợp"
          description="Tạo tin tuyển dụng mới để bắt đầu tiếp nhận và quản lý hồ sơ ứng viên."
          action={
            canRecruit ? (
              <Button variant="primary" size="md" onClick={onNewJob}>
                + Tạo tin tuyển dụng đầu tiên
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-white">
          {jobs.map((job) => {
            const isPublished = job.status === "PUBLISHED";
            const isDraft = job.status === "DRAFT";
            const formattedSalary = formatJobSalary(job);
            const skills = extractJobSkills(`${job.title} ${job.requirementsText}`);
            const locationLabel = formatJobLocation(job);
            const workModeText = workModeLabel(job.workMode);
            const categoryText = job.category?.industryName;

            return (
              <article
                key={job.jobId}
                className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between lg:gap-4"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="job-card-title-link bg-transparent border-0 p-0 text-left text-[15px] font-semibold text-ink-900 leading-snug cursor-pointer truncate max-w-full"
                      onClick={() => onSelectJob(job, "pipeline")}
                    >
                      {job.title}
                    </button>
                    <Badge tone={isPublished ? "success" : isDraft ? "warning" : "neutral"}>
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full shrink-0",
                          isPublished ? "bg-emerald-600" : isDraft ? "bg-amber-600" : "bg-slate-400"
                        )}
                        aria-hidden="true"
                      />
                      <span>{isPublished ? "Đang tuyển" : isDraft ? "Bản nháp" : "Đã đóng"}</span>
                    </Badge>
                    {job.matchingSupported === false && (
                      <Badge tone="info">Sàng lọc thủ công</Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                    <span>{locationLabel}</span>
                    <span aria-hidden="true" className="text-ink-300">·</span>
                    <span>{workModeText}</span>
                    <span aria-hidden="true" className="text-ink-300">·</span>
                    <span className="tabular-nums-kpi">{job.openings} chỉ tiêu</span>
                    {formattedSalary && (
                      <>
                        <span aria-hidden="true" className="text-ink-300">·</span>
                        <span className="font-semibold text-emerald-700 tabular-nums-kpi">{formattedSalary}</span>
                      </>
                    )}
                    {categoryText && (
                      <>
                        <span aria-hidden="true" className="text-ink-300">·</span>
                        <span>{categoryText}</span>
                      </>
                    )}
                    {skills.length > 0 && (
                      <>
                        <span aria-hidden="true" className="text-ink-300">·</span>
                        <span className="text-ink-600">{skills.slice(0, 3).join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {canRecruit && isDraft && (
                    <Button
                      variant="secondary"
                      size="sm"
                      title="Đăng tin tuyển dụng này"
                      disabled={!canPublish}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeState(job, "publish");
                      }}
                    >
                      Đăng tin
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
                      Đóng tin
                    </Button>
                  )}
                  <Button variant="subtle" size="sm" onClick={() => onSelectJob(job, "pipeline")}>
                    <UsersIcon size={14} aria-hidden="true" />
                    <span>Ứng viên &amp; Pipeline</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSelectJob(job, "analytics")}>
                    <BarChartIcon size={14} aria-hidden="true" />
                    <span>Thống kê</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSelectJob(job, "editor")}>
                    <PencilIcon size={14} aria-hidden="true" />
                    <span>Chi tiết tin</span>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(paging.total > 0 || paging.loading) && (
        <PageControls
          page={paging.page}
          size={paging.size}
          total={paging.total}
          loading={paging.loading}
          onPageChange={paging.setPage}
          label="Phân trang JD công ty"
        />
      )}
    </div>
  );
}
