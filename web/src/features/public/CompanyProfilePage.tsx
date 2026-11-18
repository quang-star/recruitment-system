import { usePagedResource } from "../../shared/api/pagination";
import { CompanyIcon, ExternalLinkIcon, JobsIcon, MapPinIcon, UsersIcon } from "../../shared/components/Icon";
import { PageControls } from "../../shared/components/PageControls";
import { useUrlParams } from "../../shared/navigation";
import { Badge, Button, Card, EmptyState, ErrorBanner } from "../../shared/ui";
import { CompanyCover } from "./CompanyCover";
import { CompanyLogo } from "./CompanyLogo";
import { CompanyInfo } from "./companyData";
import { PublicJobListCard } from "./PublicJobListCard";
import { PublicJob } from "./types";

type Props = { company: CompanyInfo; onSelectJob: (job: PublicJob) => void };

function safeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function CompanyProfilePage({ company, onSelectJob }: Props) {
  const { params, navigate } = useUrlParams();
  const jobs = usePagedResource<PublicJob>(
    "/api/v2/public/jobs",
    { companyId: company.id, sort: "newest" },
    undefined,
    12,
    {
      page: Math.min(10000, Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0)),
      onChange: (page) => navigate({ page: page ? String(page) : null })
    }
  );
  const websiteHref = safeWebsiteUrl(company.website);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <Card padding="none" className="overflow-hidden">
        <CompanyCover src={company.coverImage} className="h-44 sm:h-52 w-full" />
        <div className="p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 relative">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 min-w-0">
            <CompanyLogo
              src={company.logo}
              name={company.shortName || company.name}
              alt={`${company.shortName} logo`}
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-xl border-4 border-white shadow-card"
              textClassName="text-xl font-bold"
            />
            <div className="space-y-1.5 min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900 m-0">
                  {company.shortName || company.name}
                </h1>
                <Badge tone="brand">{company.tag}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-ink-600">
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon size={15} className="text-ink-400" aria-hidden="true" />
                  <span>{company.location}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <UsersIcon size={15} className="text-ink-400" aria-hidden="true" />
                  <span>{company.size}</span>
                </span>
              </div>
            </div>
          </div>

          {websiteHref && (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border-strong bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-slate-50 no-underline"
            >
              <span>Website công ty</span>
              <ExternalLinkIcon size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      </Card>

      <nav aria-label="Nội dung hồ sơ công ty" className="flex flex-wrap gap-2">
        <a
          href="#company-about"
          className="rounded-xl border border-border-subtle bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700 no-underline"
        >
          Giới thiệu
        </a>
        <a
          href="#company-open-jobs"
          className="rounded-xl border border-border-subtle bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-700 no-underline"
        >
          Việc làm đang tuyển ({jobs.total})
        </a>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section id="company-about" aria-labelledby="company-about-title" className="lg:col-span-1">
          <Card padding="md" className="space-y-4">
            <h2 id="company-about-title" className="text-base font-bold text-ink-900 m-0 flex items-center gap-2">
              <CompanyIcon size={18} className="text-brand-600" aria-hidden="true" />
              <span>Giới thiệu công ty</span>
            </h2>
            <p className="text-sm text-ink-600 m-0 leading-relaxed whitespace-pre-line">
              {company.description}
            </p>
            <aside aria-label="Tổng quan công ty" className="pt-3 border-t border-border-subtle space-y-2.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-ink-500">Tên pháp lý</span>
                <strong className="text-ink-800 text-right">{company.name}</strong>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-500">Quy mô</span>
                <strong className="text-ink-800 text-right">{company.size}</strong>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-500">Địa điểm</span>
                <strong className="text-ink-800 text-right">{company.location}</strong>
              </div>
            </aside>
          </Card>
        </section>

        <section
          id="company-open-jobs"
          aria-labelledby="company-open-jobs-title"
          aria-busy={jobs.loading}
          className="lg:col-span-2 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="company-open-jobs-title" className="text-lg font-bold text-ink-900 m-0 flex items-center gap-2">
              <JobsIcon size={18} className="text-brand-600" aria-hidden="true" />
              <span>Vị trí đang tuyển</span>
            </h2>
            <Badge tone="neutral">{jobs.total} vị trí</Badge>
          </div>

          {jobs.error && (
            <ErrorBanner
              tone="error"
              message={jobs.error}
              action={<Button type="button" size="sm" variant="secondary" onClick={jobs.refresh}>Thử lại</Button>}
            />
          )}

          {!jobs.loading && !jobs.error && jobs.items.length === 0 ? (
            <EmptyState
              icon={<JobsIcon size={22} />}
              title="Chưa có vị trí đang tuyển"
              description="Doanh nghiệp hiện chưa đăng tin tuyển dụng công khai nào."
            />
          ) : (
            <div className="space-y-3">
              {jobs.items.map((job) => (
                <PublicJobListCard key={job.jobId} job={job} onSelectJob={onSelectJob} />
              ))}
            </div>
          )}

          {!jobs.loading && !jobs.error && jobs.total > 0 && (
            <PageControls {...jobs} onPageChange={jobs.setPage} label="Phân trang việc làm công ty" />
          )}
        </section>
      </div>
    </div>
  );
}
