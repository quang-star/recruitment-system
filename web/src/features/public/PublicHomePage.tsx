import { FC, ReactNode, useEffect, useState } from "react";
import { PublicJob, ActiveNavTab } from "./types";
import { PublicNavbar, CandidateNavigation } from "./PublicNavbar";
import { PortalHeroBanner } from "./PortalHeroBanner";
import { FeaturedEmployers } from "./FeaturedEmployers";
import { HotJobsVIP } from "./HotJobsVIP";
import { PopularJobsGrid } from "./PopularJobsGrid";
import { JobSearchSplitView } from "./JobSearchSplitView";
import { HotIndustries } from "./HotIndustries";
import { useUrlParams, useUrlView } from "../../shared/navigation";
import { useModalFocus } from "../../shared/components/useModalFocus";
import { AIMatchingShowcase } from "./AIMatchingShowcase";
import { JobDetailDrawer } from "./JobDetailDrawer";
import { CompanyDirectoryView } from "./CompanyDirectoryView";
import { LoginPage } from "../auth/LoginPage";
import { SystemOverview } from "../system/SystemOverview";
import { apiRequest } from "../../shared/api/client";
import { extractSkillsFromJob } from "./jobPresentation";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { getPendingJobId, setPendingJobId } from "../../shared/pendingApplication";
import { BRAND_CONFIG } from "../../shared/config/brand";
import { CandidateJobsPanel } from "../candidate/CandidateJobsPanel";

import {
  resolveCompanyMeta,
  PublicCompany,
  CompanyInfo,
  mapCompanyRecord,
  setLoadedCompaniesCache,
} from "./companyData";

type Props = {
  onLoginSuccess: (session: AuthSession) => void;
  session?: AuthSession;
  candidate?: CandidateNavigation;
  children?: ReactNode;
};

export const PublicHomePage: FC<Props> = ({ onLoginSuccess, session, candidate, children }) => {
  const [activeTab, setActiveTab] = useUrlView<ActiveNavTab>("view", ["home", "search", "companies", "ai_showcase"], "home");
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [companies, setCompanies] = useState<CompanyInfo[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const { params, navigate } = useUrlParams();
  const requestedJobId = params.get("job") ?? "";
  const authMode = params.get("auth") === "register" ? "register" : "login";
  const authOpen = !session && params.has("auth");
  const accountOpen = !!candidate && candidate.activeView !== "jobs";
  const authRef = useModalFocus<HTMLElement>(authOpen, () => navigate({ auth: null }));
  const [companiesError, setCompaniesError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [detailError, setDetailError] = useState(false);
  const [applyingJob, setApplyingJob] = useState<PublicJob | null>(null);
  const [demoAccount, setDemoAccount] = useState({ email: "", revision: 0 });
  const [applicationJobId, setApplicationJobId] = useState<string | null>(() => session ? getPendingJobId() : null);
  const [applicationMessage, setApplicationMessage] = useState<string | null>(null);

  // Load real companies and published jobs directly from PostgreSQL via backend REST APIs
  useEffect(() => {
    let active = true;
    setLoadingJobs(true); setJobsError(false); setCompaniesError(false);
    Promise.all([
      apiRequest<PublicCompany[]>("/api/v2/public/companies").catch(() => { if (active) setCompaniesError(true); return [] as PublicCompany[]; }),
      apiRequest<PageResult<PublicJob>>("/api/v2/public/jobs?page=0&size=12&sort=newest").catch(() => {
        if (active) setJobsError(true);
        return { items: [], total: 0, page: 0, size: 12 };
      }),
      apiRequest<Record<string, number>>("/api/v2/public/jobs?summary").catch(() => null),
    ])
      .then(([compsData, jobsData, companyCounts]) => {
        if (!active) return;
        const rawJobs = jobsData.items;
        setTotalJobs(jobsData.total);
        const rawComps = Array.isArray(compsData) ? compsData : [];

        // 1. Process companies from database records
        const mappedComps = rawComps.map((c) => ({ ...mapCompanyRecord(c, rawJobs),
          openJobsCount: companyCounts ? companyCounts[c.companyId] ?? 0 : null }));
        setLoadedCompaniesCache(mappedComps);
        setCompanies(mappedComps);

        // 2. Link jobs to real companies and extract technical skills dynamically
        const enrichedJobs: PublicJob[] = rawJobs.map((j) => {
          const meta = resolveCompanyMeta(j.companyId, j.companyName, mappedComps);
          const skills = j.skills && j.skills.length > 0
            ? j.skills
            : extractSkillsFromJob(j.requirementsText, j.description, j.title);

          return {
            ...j,
            companyName: meta.shortName || j.companyName,
            companyLogo: j.companyLogo || meta.logo,
            skills,
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
  }, [loadAttempt]);

  function selectDemoAccount(role: "CANDIDATE" | "RECRUITER") {
    const email =
      role === "CANDIDATE" ? "candidate.demo@smart.local" : "recruiter.demo@smart.local";
    setDemoAccount((current) => ({ email, revision: current.revision + 1 }));
    handleOpenAuth();
  }

  function handleOpenAuth(mode: "login" | "register" = "login") {
    if (candidate) { candidate.onNavigate("cv"); return; }
    navigate({ auth: mode });
  }

  function handleSelectJob(job: PublicJob) {
    setSelectedJob(job);
    navigate({ job: job.jobId });
  }

  function handleApplyJob(job: PublicJob) {
    setSelectedJob(null);
    setApplicationMessage(null);
    if (session) {
      setApplicationJobId(job.jobId);
      navigate({ job: null, auth: null });
      return;
    }
    setApplyingJob(job);
    setPendingJobId(job.jobId);
    navigate({ job: null, auth: "login" });
  }

  function openSearch(keyword = "", companyId = "", location = "") {
    setSelectedJob(null);
    navigate({ view: "search", candidate: null, auth: null, q: keyword, company: companyId, job: null,
      location, mode: null, level: null, sort: null, page: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    let active = true;
    setDetailError(false);
    if (!requestedJobId) { setSelectedJob(null); return; }
    const cached = jobs.find((job) => job.jobId === requestedJobId);
    if (cached) { setSelectedJob(cached); return; }
    void apiRequest<PageResult<PublicJob>>(`/api/v2/public/jobs?page=0&size=1&jobId=${encodeURIComponent(requestedJobId)}`)
      .then((result) => { if (active) { setSelectedJob(result.items[0] ?? null); setDetailError(!result.items.length); } })
      .catch(() => { if (active) { setSelectedJob(null); setDetailError(true); } });
    return () => { active = false; };
  }, [requestedJobId, jobs]);

  return (
    <div className={`portal-page ${session ? "candidate-portal-page" : ""}`}>
      {/* 1. 2-Tier Sticky Navbar */}
      <PublicNavbar
        activeTab={accountOpen ? undefined : activeTab}
        candidate={candidate}
        onSelectTab={(tab) => {
          navigate({ view: tab, candidate: null, job: null, auth: null });
          setSelectedJob(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onOpenAuth={handleOpenAuth}
        onSearchSubmit={(query) => openSearch(query)}
      />

      {/* 2. Main Content Views based on active tab */}
      <main className="portal-main">
        {applicationMessage && <p className="portal-data-message success-message" role="status">{applicationMessage}
          <button type="button" onClick={() => candidate?.onNavigate("applications")}>Xem việc làm đã ứng tuyển</button>
          <button type="button" aria-label="Đóng thông báo ứng tuyển" onClick={() => setApplicationMessage(null)}>×</button></p>}
        {accountOpen ? (
          <div className="portal-container portal-account-content candidate-portal-layout">
            <div className="candidate-account-bar">
              <button
                type="button"
                className="candidate-back-home-btn"
                onClick={() => candidate?.onNavigate("jobs")}
              >
                <span aria-hidden="true">←</span> Quay lại trang chủ việc làm
              </button>
            </div>
            {children}
          </div>
        ) : <>
        {companiesError && <p className="portal-data-message" role="alert">Chưa tải được thông tin doanh nghiệp. <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></p>}
        {detailError && <p className="portal-data-message" role="alert">Không mở được vị trí này hoặc tin đã ngừng tuyển. <button type="button" onClick={() => navigate({ job: null })}>Đóng thông báo</button></p>}
        {jobsError && <p className="portal-data-message" role="alert">Chưa thể tải danh sách việc làm. <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Thử lại</button></p>}
        {loadingJobs && activeTab === "home" && <p className="portal-data-message" aria-live="polite">Đang cập nhật cơ hội việc làm…</p>}
        {!loadingJobs && !jobsError && jobs.length === 0 && activeTab === "home" && <p className="portal-data-message" aria-live="polite">Hiện chưa có vị trí đang tuyển. Bạn có thể tạo hồ sơ để chuẩn bị cho cơ hội tiếp theo.</p>}
        {activeTab === "home" && (
          <>
            {/* Hero Banner */}
            <PortalHeroBanner
              jobCount={totalJobs}
              signedIn={!!session}
              onExploreClick={() => openSearch()}
              onSearch={(keyword, location) => openSearch(keyword, "", location)}
              onUploadCv={() => handleOpenAuth("register")}
            />

            <HotJobsVIP jobs={jobs} onSelectJob={handleSelectJob} onApplyJob={handleApplyJob} />
            <PopularJobsGrid jobs={jobs.slice(4)} onSelectJob={handleSelectJob} onApplyJob={handleApplyJob} />

            {/* Featured Employers Spotlight Row */}
            <FeaturedEmployers
              companies={companies}
              onSelectCompany={(companyId) => {
                if (companyId) openSearch("", companyId);
                else { setActiveTab("companies"); window.scrollTo({ top: 0, behavior: "smooth" }); }
              }}
            />

            {/* Hot Industries Section with Circular Icons */}
            <HotIndustries
              onSelectCategory={(keyword) => openSearch(keyword)}
            />
          </>
        )}

        {activeTab === "search" && (
          <JobSearchSplitView
            key={`${params.get("q") ?? ""}|${params.get("company") ?? ""}`}
            initialKeyword={params.get("q") ?? ""}
            initialCompanyId={params.get("company") ?? ""}
            selectedJobId={requestedJobId || undefined}
            selectedJob={selectedJob}
            session={session}
            onSelectJob={handleSelectJob}
            onApplyJob={handleApplyJob}
            onRequireLogin={() => handleOpenAuth("login")}
            onOpenCvLibrary={() => candidate?.onNavigate("cv")}
          />
        )}

        {activeTab === "companies" && (
          <CompanyDirectoryView
            companies={companies}
            onSelectCompany={(companyId) => openSearch("", companyId)}
          />
        )}

        {activeTab === "ai_showcase" && (
          <div className="portal-ai-view">
            <AIMatchingShowcase />
            <SystemOverview />
          </div>
        )}

        {/* 3. Accessible Auth Section (Guarantees Playwright E2E & Vitest Compatibility) */}
        {authOpen && <div className="modal-backdrop public-auth-backdrop" role="presentation">
        <section ref={authRef} tabIndex={-1} role="dialog" aria-modal="true" id="auth-section" className="portal-auth-section public-auth-dialog" aria-labelledby="auth-title">
          <button type="button" className="auth-close secondary-button" aria-label="Đóng đăng nhập" onClick={() => navigate({ auth: null })}>×</button>
          <div className="portal-container auth-inner-grid">
            <div className="auth-left-info">
              <span className="auth-eyebrow">HỒ SƠ & CƠ HỘI NGHỀ NGHIỆP</span>
              <h2 id="auth-title" className="auth-title-text">
                Bước tiếp theo cho sự nghiệp của bạn
              </h2>
              <p className="auth-desc-text">
                Đăng nhập để quản lý hồ sơ ứng viên, tải lên CV để hệ thống AI tự động trích xuất thông tin, hoặc quản lý quy trình tuyển dụng thông minh dành cho doanh nghiệp.
              </p>

              <details className="thesis-demo-panel">
                <summary>Trải nghiệm bằng tài khoản demo</summary>
                <div className="demo-panel-header">
                  <span className="sparkle-icon">✨</span>
                  <strong>Chọn tài khoản trình diễn</strong>
                </div>
                <p className="demo-panel-hint">
                  Chọn tài khoản để điền email, sau đó nhập mật khẩu đã thiết lập khi tạo dữ liệu demo.
                </p>
                <div className="demo-panel-buttons">
                  <button
                    type="button"
                    className="portal-demo-card-btn candidate"
                    onClick={() => selectDemoAccount("CANDIDATE")}
                  >
                    <span>👤 Chọn tài khoản ứng viên</span>
                    <small>candidate.demo@smart.local</small>
                  </button>
                  <button
                    type="button"
                    className="portal-demo-card-btn recruiter"
                    onClick={() => selectDemoAccount("RECRUITER")}
                  >
                    <span>🏢 Chọn tài khoản recruiter</span>
                    <small>recruiter.demo@smart.local</small>
                  </button>
                </div>
              </details>
            </div>

            <div className="auth-right-form-card">
              {applyingJob && <div className="pending-application" role="status">
                <strong>Bạn đang ứng tuyển: {applyingJob.title}</strong>
                <p>Đăng nhập tài khoản ứng viên để chọn CV và xác nhận gửi hồ sơ.</p>
                <button type="button" className="secondary-button" onClick={() => {
                  setApplyingJob(null); setPendingJobId(null);
                }}>Hủy lựa chọn</button>
              </div>}
              <LoginPage key={`${demoAccount.revision}-${authMode}`} initialMode={authMode} initialEmail={demoAccount.email} onSuccess={onLoginSuccess} />
            </div>
          </div>
        </section></div>}
        </>}
      </main>

      {session && applicationJobId && <CandidateJobsPanel key={applicationJobId} session={session}
        initialJobId={applicationJobId} dialogOnly onClose={() => setApplicationJobId(null)}
        onApplied={(message) => { setApplicationJobId(null); setApplicationMessage(message); }} />}

      {/* 5. Job Detail Drawer when selected */}
      {selectedJob && activeTab !== "search" && (
        <JobDetailDrawer
          job={selectedJob}
          session={session}
          onClose={() => { setSelectedJob(null); navigate({ job: null }); }}
          onApply={() => handleApplyJob(selectedJob)}
          onRequireLogin={() => handleOpenAuth("login")}
          onOpenCvLibrary={() => candidate?.onNavigate("cv")}
        />
      )}

      {/* 6. Professional Footer */}
      <footer className="portal-footer-root">
        <div className="portal-container footer-content-grid">
          <div className="footer-col brand-col">
            <h3 className="footer-logo">{BRAND_CONFIG.name || BRAND_CONFIG.defaultPortalLabel}</h3>
            <p className="footer-address">
              Hệ thống Tuyển dụng Thông minh với Công nghệ Bóc tách CV (OCR/NLP) và So khớp Giải trình được.
            </p>
            <p className="footer-meta">
              Kết nối ứng viên và nhà tuyển dụng bằng thông tin rõ ràng.
            </p>
            <div className="footer-copyright">
              © 2026 Smart Recruitment. Tất cả quyền được bảo lưu.
            </div>
          </div>

          <div className="footer-col">
            <h4>DÀNH CHO ỨNG VIÊN</h4>
            <ul>
              <li><button type="button" onClick={() => openSearch()}>Tìm việc làm IT</button></li>
              <li><button type="button" onClick={() => navigate({ view: "companies", candidate: null, job: null })}>Danh sách doanh nghiệp</button></li>
              <li><button type="button" onClick={() => handleOpenAuth()}>Tải lên CV ứng tuyển</button></li>
              <li><button type="button" onClick={() => handleOpenAuth()}>Tạo hồ sơ chuyên nghiệp</button></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>DÀNH CHO NHÀ TUYỂN DỤNG</h4>
            <ul>
              <li><button type="button" onClick={() => handleOpenAuth()}>Đăng tin tuyển dụng</button></li>
              <li><button type="button" onClick={() => handleOpenAuth()}>Quản lý ứng viên</button></li>
              <li><button type="button" onClick={() => setActiveTab("companies")}>Hồ sơ doanh nghiệp</button></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>QUẢN LÝ TÀI KHOẢN</h4>
            <ul>
              {candidate ? <>
                <li><button type="button" onClick={() => candidate.onNavigate("profile")}>Hồ sơ cá nhân</button></li>
                <li><button type="button" onClick={() => candidate.onNavigate("security")}>Bảo mật tài khoản</button></li>
              </> : <>
                <li><button type="button" onClick={() => handleOpenAuth("register")}>Tạo tài khoản</button></li>
                <li><button type="button" onClick={() => handleOpenAuth()}>Đăng nhập & khôi phục tài khoản</button></li>
              </>}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
};
