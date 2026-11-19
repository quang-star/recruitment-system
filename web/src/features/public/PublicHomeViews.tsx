import { AuthSession } from "../../shared/auth/session";
import { Button } from "../../shared/ui";
import { AIMatchingShowcase } from "./AIMatchingShowcase";
import { CompanyDirectoryView } from "./CompanyDirectoryView";
import { CompanyProfilePage } from "./CompanyProfilePage";
import { FeaturedEmployers } from "./FeaturedEmployers";
import { HotIndustries } from "./HotIndustries";
import { HotJobsVIP, HomeExplorePreset } from "./HotJobsVIP";
import { JobDetailPage } from "./JobDetailPage";
import { JobSearchPage } from "./JobSearchPage";
import { PortalHeroBanner } from "./PortalHeroBanner";
import { CompanyInfo } from "./companyData";
import { ActiveNavTab, JobDiscovery, PublicJob } from "./types";

/** Renders the active public view: job detail, company profile, home landing, job search, company directory, or AI overview. */
export function PublicHomeViews({
  session,
  activeTab,
  requestedJobId,
  detailError,
  detailJob,
  companyPageOpen,
  profileCompany,
  loadingJobs,
  jobsError,
  jobs,
  totalJobs,
  discovery,
  companies,
  restoreFocusJobId,
  onClearRestoreFocus,
  onApplyJob,
  onSelectJob,
  onOpenCompany,
  onOpenSearch,
  onOpenAuth,
  onOpenCvLibrary,
  onViewApplication,
  applicationRefreshKey
}: {
  session?: AuthSession;
  activeTab: ActiveNavTab;
  requestedJobId: string;
  detailError: boolean;
  detailJob: PublicJob | null;
  companyPageOpen: boolean;
  profileCompany?: CompanyInfo;
  loadingJobs: boolean;
  jobsError: boolean;
  jobs: PublicJob[];
  totalJobs: number;
  discovery: JobDiscovery;
  companies: CompanyInfo[];
  restoreFocusJobId: string | null;
  onClearRestoreFocus: () => void;
  onApplyJob: (job: PublicJob, preferredCv?: { cvId: string; cvVersionId?: string }) => void;
  onSelectJob: (job: PublicJob) => void;
  onOpenCompany: (companyId: string) => void;
  onOpenSearch: (
    keyword?: string,
    companyId?: string,
    locationQuery?: string,
    category?: JobDiscovery["categories"][number],
    preset?: HomeExplorePreset
  ) => void;
  onOpenAuth: (mode?: "login" | "register") => void;
  onOpenCvLibrary: () => void;
  onViewApplication?: (applicationId: string) => void;
  applicationRefreshKey?: number;
}) {
  return (
    <>
      {requestedJobId &&
        (detailError ? (
          <div className="mx-auto max-w-2xl px-4 py-12">
            <section
              role="alert"
              className="rounded-lg border border-border-subtle bg-white p-8 text-center shadow-card space-y-4"
            >
              <h1 className="text-xl font-bold text-ink-900 m-0">Không mở được vị trí này</h1>
              <p className="text-sm text-ink-500 m-0">Tin có thể đã ngừng tuyển hoặc tạm thời chưa tải được.</p>
            </section>
          </div>
        ) : detailJob ? (
          <JobDetailPage
            job={detailJob}
            company={companies.find((company) => company.id === detailJob.companyId)}
            session={session}
            onApply={onApplyJob}
            onSelectJob={onSelectJob}
            onViewCompany={onOpenCompany}
            onRequireLogin={() => onOpenAuth("login")}
            onOpenCvLibrary={onOpenCvLibrary}
            onViewApplication={onViewApplication}
            applicationRefreshKey={applicationRefreshKey}
          />
        ) : (
          <div className="mx-auto max-w-4xl px-4 py-12">
            <section
              role="status"
              className="rounded-lg border border-border-subtle bg-white p-8 text-center text-sm text-ink-600 shadow-card"
            >
              Đang tải chi tiết việc làm…
            </section>
          </div>
        ))}

      {companyPageOpen &&
        !requestedJobId &&
        (profileCompany ? (
          <CompanyProfilePage
            key={profileCompany.id}
            company={profileCompany}
            onSelectJob={onSelectJob}
          />
        ) : loadingJobs ? (
          <div className="mx-auto max-w-4xl px-4 py-12">
            <section
              role="status"
              className="rounded-lg border border-border-subtle bg-white p-8 text-center text-sm text-ink-600 shadow-card"
            >
              Đang tải hồ sơ công ty…
            </section>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl px-4 py-12">
            <section
              role="alert"
              className="rounded-lg border border-border-subtle bg-white p-8 text-center shadow-card space-y-4"
            >
              <h1 className="text-xl font-bold text-ink-900 m-0">Chưa mở được hồ sơ công ty</h1>
              <p className="text-sm text-ink-500 m-0">
                Công ty có thể không còn được hiển thị hoặc thông tin chưa tải được.
              </p>
              <div>
                <Button type="button" variant="secondary" onClick={() => onOpenCompany("")}>
                  Danh sách công ty
                </Button>
              </div>
            </section>
          </div>
        ))}

      {activeTab === "home" && !requestedJobId && (
        <>
          <PortalHeroBanner
            locations={discovery.locations}
            suggestedKeywords={[...new Set(jobs.flatMap((job) => job.skills ?? []))].slice(0, 6)}
            signedIn={!!session}
            onExploreClick={() => onOpenSearch()}
            onSearch={(keyword, locationQuery) => onOpenSearch(keyword, "", locationQuery)}
            onUploadCv={() => onOpenAuth("register")}
          />

          <HotJobsVIP
            jobs={jobs}
            totalJobs={totalJobs}
            loadingJobs={loadingJobs}
            jobsError={jobsError}
            onSelectJob={onSelectJob}
            onApplyJob={onApplyJob}
            onExploreAll={(preset) => onOpenSearch("", "", "", undefined, preset)}
          />

          <FeaturedEmployers companies={companies} onSelectCompany={onOpenCompany} />

          <HotIndustries
            categories={discovery.categories}
            onSelectCategory={(category) => onOpenSearch("", "", "", category)}
          />
        </>
      )}

      {activeTab === "search" && !requestedJobId && !companyPageOpen && (
        <JobSearchPage
          discovery={discovery}
          onSelectJob={onSelectJob}
          restoreFocusJobId={restoreFocusJobId}
          onFocusRestored={onClearRestoreFocus}
        />
      )}

      {activeTab === "companies" && !requestedJobId && !companyPageOpen && (
        <CompanyDirectoryView companies={companies} onSelectCompany={onOpenCompany} />
      )}

      {activeTab === "ai_showcase" && !requestedJobId && (
        <AIMatchingShowcase
          signedIn={!!session}
          onExploreJobs={() => onOpenSearch()}
          onOpenCv={() => onOpenAuth("register")}
        />
      )}
    </>
  );
}
