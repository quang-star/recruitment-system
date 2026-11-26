import { FC, ReactNode, useEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { useUrlParams } from "../../shared/navigation";
import { getPendingJobId, setPendingJobId } from "../../shared/pendingApplication";
import { EnsureRouter, routes, useSafeNavigate } from "../../shared/router";
import { Button, ErrorBanner } from "../../shared/ui";
import { CandidateJobsPanel } from "../candidate/CandidateJobsPanel";
import { HomeExplorePreset } from "./HotJobsVIP";
import { PublicAuthModal } from "./PublicAuthModal";
import { PublicFooter } from "./PublicFooter";
import { PublicHomeViews } from "./PublicHomeViews";
import { CandidateNavigation, PublicNavbar } from "./PublicNavbar";
import {
  CompanyInfo,
  PublicCompany,
  mapCompanyRecord,
  resolveCompanyMeta,
  setLoadedCompaniesCache
} from "./companyData";
import { extractSkillsFromJob } from "./jobPresentation";
import { ActiveNavTab, JobDiscovery, PublicJob } from "./types";

type Props = {
  onLoginSuccess: (session: AuthSession) => void;
  session?: AuthSession;
  candidate?: CandidateNavigation;
  children?: ReactNode;
};

const ALLOWED_TABS: readonly ActiveNavTab[] = ["home", "search", "companies", "ai_showcase"];
const FILTER_QUERY_KEYS = [
  "q",
  "location",
  "industry",
  "specialization",
  "categoryName",
  "mode",
  "level",
  "type",
  "salary",
  "sort",
  "page",
  "company"
] as const;

function buildPreservedQuery(params: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of FILTER_QUERY_KEYS) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}

function PublicHomePageInner({ onLoginSuccess, session, candidate, children }: Props) {
  const location = useLocation();
  const safeNavigate = useSafeNavigate();
  const { params, navigate } = useUrlParams();

  const jobPathMatch = location.pathname.match(/^\/jobs\/([^/]+)$/);
  const companyPathMatch = location.pathname.match(/^\/companies\/([^/]+)$/);

  const rawView = params.get("view") as ActiveNavTab;
  const queryTab: ActiveNavTab = ALLOWED_TABS.includes(rawView) ? rawView : "home";
  const activeTab: ActiveNavTab =
    location.pathname === routes.jobs || Boolean(jobPathMatch)
      ? "search"
      : location.pathname === routes.companies || Boolean(companyPathMatch)
        ? "companies"
        : location.pathname === routes.aiShowcase
          ? "ai_showcase"
          : queryTab;

  const requestedJobId = jobPathMatch ? decodeURIComponent(jobPathMatch[1]) : (params.get("job") ?? "");
  const requestedCompanyId = companyPathMatch
    ? decodeURIComponent(companyPathMatch[1])
    : (params.get("company") ?? "");

  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [discovery, setDiscovery] = useState<JobDiscovery>({ locations: [], categories: [] });
  const [discoveryError, setDiscoveryError] = useState(false);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const [restoreFocusJobId, setRestoreFocusJobId] = useState<string | null>(null);

  const companyPageOpen = !!requestedCompanyId && (activeTab === "companies" || activeTab === "search");
  const profileCompany = companies.find((company) => company.id === requestedCompanyId);
  const detailJob = selectedJob?.jobId === requestedJobId ? selectedJob : null;
  const authMode = params.get("auth") === "register" ? "register" : "login";
  const isProtectedPath = /^\/(candidate|recruiter|admin)(\/|$)/.test(location.pathname);
  const authOpen =
    !session &&
    (location.pathname === routes.login ||
      location.pathname === routes.acceptInvitation ||
      isProtectedPath ||
      params.has("auth"));
  const accountOpen = !!candidate && candidate.activeView !== "jobs";

  function closeAuth() {
    if (location.pathname === routes.login || location.pathname === routes.acceptInvitation || isProtectedPath) {
      safeNavigate(routes.home);
      return;
    }
    navigate({ auth: null });
  }

  const [companiesError, setCompaniesError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [detailError, setDetailError] = useState(false);
  const [applicationRefreshKey, setApplicationRefreshKey] = useState(0);
  const [authAccountType, setAuthAccountType] = useState<"CANDIDATE" | "RECRUITER">("CANDIDATE");
  const [portalNotice, setPortalNotice] = useState<string | null>(null);

  useEffect(() => {
    if (session && params.has("auth")) {
      navigate({ auth: null }, true);
    }
  }, [session, params, navigate]);
  const [applyingJob, setApplyingJob] = useState<PublicJob | null>(null);
  const [demoAccount, setDemoAccount] = useState({ email: "", revision: 0 });
  const [applicationJobId, setApplicationJobId] = useState<string | null>(() =>
    session ? getPendingJobId() : null
  );
  const [applicationCv, setApplicationCv] = useState<{ cvId: string; cvVersionId?: string } | null>(null);
  const [applicationMessage, setApplicationMessage] = useState<string | null>(null);

  const loadedAttemptRef = useRef<number | null>(null);

  // Load real companies and published jobs from PostgreSQL via Gateway REST APIs
  useEffect(() => {
    if (accountOpen || loadedAttemptRef.current === loadAttempt) return;
    let active = true;
    setLoadingJobs(true);
    setJobsError(false);
    setCompaniesError(false);
    setDiscoveryError(false);

    Promise.all([
      apiRequest<PublicCompany[]>("/api/v2/public/companies").catch(() => {
        if (active) setCompaniesError(true);
        return [] as PublicCompany[];
      }),
      apiRequest<PageResult<PublicJob>>("/api/v2/public/jobs?page=0&size=12&sort=newest").catch(() => {
        if (active) setJobsError(true);
        return { items: [], total: 0, page: 0, size: 12 };
      }),
      apiRequest<Record<string, number>>("/api/v2/public/jobs?summary").catch(() => null),
      apiRequest<JobDiscovery>("/api/v2/public/jobs/discovery")
        .then((result) => {
          if (!Array.isArray(result.locations) || !Array.isArray(result.categories)) {
            throw new Error("Invalid discovery response");
          }
          return result;
        })
        .catch(() => {
          if (active) setDiscoveryError(true);
          return { locations: [], categories: [] };
        })
    ])
      .then(([compsData, jobsData, companyCounts, discoveryData]) => {
        if (!active) return;
        loadedAttemptRef.current = loadAttempt;
        const rawJobs = jobsData.items;
        setTotalJobs(jobsData.total);
        setDiscovery(discoveryData);
        const rawComps = Array.isArray(compsData) ? compsData : [];

        const mappedComps = rawComps.map((c) => ({
          ...mapCompanyRecord(c, rawJobs),
          openJobsCount: companyCounts ? (companyCounts[c.companyId] ?? 0) : null
        }));
        setLoadedCompaniesCache(mappedComps);
        setCompanies(mappedComps);

        const enrichedJobs: PublicJob[] = rawJobs.map((j) => {
          const meta = resolveCompanyMeta(j.companyId, j.companyName, mappedComps);
          const skills =
            j.skills && j.skills.length > 0
              ? j.skills
              : extractSkillsFromJob(j.requirementsText, j.description, j.title);

          return {
            ...j,
            companyName: meta.shortName || j.companyName,
            companyLogo: j.companyLogo || meta.logo,
            skills
          };
        });

        setJobs(enrichedJobs);
      })
      .finally(() => {
        if (active) setLoadingJobs(false);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt, accountOpen]);

  function selectDemoAccount(role: "CANDIDATE" | "RECRUITER") {
    const email = role === "CANDIDATE" ? "candidate.demo@smart.local" : "recruiter.demo@smart.local";
    setDemoAccount((current) => ({ email, revision: current.revision + 1 }));
    handleOpenAuth("login", role);
  }

  function handleOpenAuth(
    mode: "login" | "register" = "login",
    accountType: "CANDIDATE" | "RECRUITER" = "CANDIDATE"
  ) {
    setPortalNotice(null);
    if (candidate) {
      if (accountType === "RECRUITER") {
        setPortalNotice(
          "Tính năng đăng tin và quản lý ứng viên dành cho tài khoản Nhà tuyển dụng. Hãy đăng xuất ở góc trên bên phải nếu bạn muốn dùng tài khoản Nhà tuyển dụng."
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      candidate.onNavigate("cv");
      return;
    }
    setAuthAccountType(accountType);
    navigate({ auth: mode });
  }

  function handleSelectJob(job: PublicJob) {
    setRestoreFocusJobId(null);
    setSelectedJob(job);
    const nextParams = new URLSearchParams(buildPreservedQuery(params));
    if (requestedCompanyId) nextParams.set("company", requestedCompanyId);
    const qs = nextParams.toString();
    safeNavigate(`${routes.jobDetail(job.jobId)}${qs ? `?${qs}` : ""}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleApplyJob(job: PublicJob, preferredCv?: { cvId: string; cvVersionId?: string }) {
    setSelectedJob(job);
    setApplicationMessage(null);
    if (session) {
      setApplicationCv(preferredCv ?? null);
      setApplicationJobId(job.jobId);
      const qs = buildPreservedQuery(params);
      safeNavigate(`${routes.jobDetail(job.jobId)}${qs}`);
      return;
    }
    setApplicationCv(null);
    setApplyingJob(job);
    setPendingJobId(job.jobId);
    const qs = new URLSearchParams(buildPreservedQuery(params));
    qs.set("auth", "login");
    safeNavigate(`${routes.jobDetail(job.jobId)}?${qs.toString()}`);
  }

  function openSearch(
    keyword = "",
    companyId = "",
    locationQuery = "",
    category?: JobDiscovery["categories"][number],
    preset?: HomeExplorePreset
  ) {
    setSelectedJob(null);
    const next = new URLSearchParams();
    if (keyword) next.set("q", keyword);
    if (companyId) next.set("company", companyId);
    if (locationQuery) next.set("location", locationQuery);
    if (category?.industryId) next.set("industry", category.industryId);
    if (category?.specializationId) next.set("specialization", category.specializationId);
    if (category?.name) next.set("categoryName", category.name);
    if (preset?.mode) next.set("mode", preset.mode);
    if (preset?.sort) next.set("sort", preset.sort);
    if (preset?.level) next.set("level", preset.level);
    const qs = next.toString();
    safeNavigate(qs ? `${routes.jobs}?${qs}` : routes.jobs);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openCompany(companyId: string) {
    setSelectedJob(null);
    safeNavigate(companyId ? routes.companyProfile(companyId) : routes.companies);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleSelectTab(tab: ActiveNavTab) {
    setSelectedJob(null);
    if (tab === "home") safeNavigate(routes.home);
    else if (tab === "search") safeNavigate(routes.jobs);
    else if (tab === "companies") safeNavigate(routes.companies);
    else safeNavigate(routes.aiShowcase);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const navigationType = useNavigationType();
  const prevRequestedJobIdRef = useRef(requestedJobId);
  useEffect(() => {
    const previousJobId = prevRequestedJobIdRef.current;
    prevRequestedJobIdRef.current = requestedJobId;
    if (previousJobId && !requestedJobId && navigationType === "POP" && activeTab === "search" && !companyPageOpen) {
      setRestoreFocusJobId(previousJobId);
    }
  }, [requestedJobId, navigationType, activeTab, companyPageOpen]);

  useEffect(() => {
    let active = true;
    setDetailError(false);
    if (!requestedJobId) {
      setSelectedJob(null);
      return;
    }
    const cached = jobs.find((job) => job.jobId === requestedJobId);
    if (cached) {
      setSelectedJob(cached);
      return;
    }
    void apiRequest<PageResult<PublicJob>>(
      `/api/v2/public/jobs?page=0&size=1&jobId=${encodeURIComponent(requestedJobId)}`
    )
      .then((result) => {
        if (active) {
          setSelectedJob(result.items[0] ?? null);
          setDetailError(!result.items.length);
        }
      })
      .catch(() => {
        if (active) {
          setSelectedJob(null);
          setDetailError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [requestedJobId, jobs]);

  const portalErrors = [
    companiesError ? "Chưa tải được thông tin doanh nghiệp." : null,
    discoveryError ? "Chưa tải được địa điểm và nhóm nghề đang tuyển." : null,
    jobsError ? "Chưa thể tải danh sách việc làm." : null
  ].filter((msg): msg is string => msg !== null);

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900">
      <PublicNavbar
        activeTab={accountOpen ? undefined : companyPageOpen ? "companies" : activeTab}
        candidate={candidate}
        onSelectTab={handleSelectTab}
        onOpenAuth={handleOpenAuth}
        onSearchSubmit={(query) => openSearch(query)}
      />

      <div className="flex-1">
        {portalNotice && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              <span>{portalNotice}</span>
              <button
                type="button"
                aria-label="Đóng thông báo vai trò"
                onClick={() => setPortalNotice(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-amber-800 hover:bg-amber-100 cursor-pointer bg-transparent border-0"
              >
                ×
              </button>
            </div>
          </div>
        )}
        {applicationMessage && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              role="status"
            >
              <span>{applicationMessage}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => candidate?.onNavigate("applications")}
                >
                  Xem việc làm đã ứng tuyển
                </Button>
                <button
                  type="button"
                  aria-label="Đóng thông báo ứng tuyển"
                  onClick={() => setApplicationMessage(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-emerald-800 hover:bg-emerald-100 cursor-pointer bg-transparent border-0"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        {accountOpen ? (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-5">
            {children}
          </div>
        ) : (
          <>
            {portalErrors.length > 0 && (
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 space-y-2">
                {portalErrors.map((msg) => (
                  <ErrorBanner
                    key={msg}
                    tone="error"
                    message={msg}
                    action={
                      <Button type="button" size="sm" variant="secondary" onClick={() => setLoadAttempt((v) => v + 1)}>
                        Thử lại
                      </Button>
                    }
                  />
                ))}
              </div>
            )}

            <PublicHomeViews
              session={session}
              activeTab={activeTab}
              requestedJobId={requestedJobId}
              detailError={detailError}
              detailJob={detailJob}
              companyPageOpen={companyPageOpen}
              profileCompany={profileCompany}
              loadingJobs={loadingJobs}
              jobsError={jobsError}
              jobs={jobs}
              totalJobs={totalJobs}
              discovery={discovery}
              companies={companies}
              restoreFocusJobId={restoreFocusJobId}
              onClearRestoreFocus={() => setRestoreFocusJobId(null)}
              onApplyJob={handleApplyJob}
              onSelectJob={handleSelectJob}
              onOpenCompany={openCompany}
              onOpenSearch={openSearch}
              onOpenAuth={handleOpenAuth}
              onOpenCvLibrary={() => candidate?.onNavigate("cv")}
              applicationRefreshKey={applicationRefreshKey}
              onViewApplication={(applicationId) =>
                safeNavigate(`${routes.candidate.applications}?application=${encodeURIComponent(applicationId)}`)
              }
            />

            <PublicAuthModal
              open={authOpen}
              authMode={authMode}
              initialAccountType={authAccountType}
              demoAccount={demoAccount}
              applyingJob={applyingJob}
              onClose={closeAuth}
              onSelectDemoAccount={selectDemoAccount}
              onCancelApplyingJob={() => setApplyingJob(null)}
              onLoginSuccess={onLoginSuccess}
            />
          </>
        )}
      </div>

      {session && applicationJobId && (
        <CandidateJobsPanel
          key={`${applicationJobId}:${applicationCv?.cvId ?? ""}:${applicationCv?.cvVersionId ?? ""}`}
          session={session}
          initialJobId={applicationJobId}
          initialCvId={applicationCv?.cvId}
          initialCvVersionId={applicationCv?.cvVersionId}
          dialogOnly
          onOpenCvLibrary={() => {
            setApplicationJobId(null);
            setApplicationCv(null);
            candidate?.onNavigate("cv");
          }}
          onClose={() => {
            setApplicationJobId(null);
            setApplicationCv(null);
          }}
          onApplied={(message) => {
            setApplicationJobId(null);
            setApplicationCv(null);
            setApplicationMessage(message);
            setApplicationRefreshKey((value) => value + 1);
          }}
        />
      )}

      <PublicFooter
        candidate={candidate}
        onOpenSearch={() => openSearch()}
        onOpenCompanies={() => openCompany("")}
        onOpenAuth={handleOpenAuth}
      />
    </div>
  );
}

/** Public portal homepage, job discovery, company profiles, and authentication modal shell. */
export const PublicHomePage: FC<Props> = (props) => (
  <EnsureRouter>
    <PublicHomePageInner {...props} />
  </EnsureRouter>
);
