import { useUrlParams } from "../../shared/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon, JobsIcon, CompanyIcon, SparklesIcon } from "../../shared/components/Icon";
import { formatSalary, workModeLabel, employmentTypeLabel, seniorityLabel, publishedLabel, extractSkillsFromJob } from "./jobPresentation";
import { usePagedResource } from "../../shared/api/pagination";
import { PageControls } from "../../shared/components/PageControls";
import { PublicJob } from "./types";
import { resolveCompanyMeta } from "./companyData";
import { CompanyCover } from "./CompanyCover";
import { PreApplyMatchWidget } from "../application/PreApplyMatchWidget";
import { AuthSession } from "../../shared/auth/session";

type JobSearchSplitViewProps = {
  initialKeyword?: string;
  initialCompanyId?: string;
  selectedJobId?: string;
  selectedJob?: PublicJob | null;
  session?: AuthSession | null;
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
  onRequireLogin?: () => void;
  onOpenCvLibrary?: () => void;
};

export const SALARY_FILTER_OPTIONS: Record<string, { label: string; min?: number; max?: number }> = {
  under_15: { label: "Dưới 15 triệu", max: 15000000 },
  "15_30": { label: "15 – 30 triệu", min: 15000000, max: 30000000 },
  "30_50": { label: "30 – 50 triệu", min: 30000000, max: 50000000 },
  over_50: { label: "Trên 50 triệu", min: 50000000 },
};

export function JobSearchSplitView({
  initialKeyword = "",
  initialCompanyId = "",
  selectedJobId,
  selectedJob,
  session,
  onSelectJob,
  onApplyJob,
  onRequireLogin,
  onOpenCvLibrary
}: JobSearchSplitViewProps) {
  const { params, navigate } = useUrlParams();
  const keyword = params.get("q") ?? initialKeyword;
  const setKeyword = (value: string) => navigate({ q: value, page: null, job: null });
  const [draftKeyword, setDraftKeyword] = useState(initialKeyword);
  const companyId = params.get("company") ?? initialCompanyId;
  const setCompanyId = (value: string) => navigate({ company: value, page: null, job: null });
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileDetailOpen || !window.matchMedia("(max-width: 768px)").matches) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    detailRef.current?.focus({ preventScroll: true });
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileDetailOpen(false);
      if (event.key !== "Tab") return;
      const elements = detailRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input, select, [tabindex='0']");
      const first = elements?.[0];
      const last = elements?.[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === detailRef.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [mobileDetailOpen]);

  function resetFilters() {
    setDraftKeyword("");
    navigate({
      q: null,
      company: null,
      location: null,
      mode: null,
      level: null,
      type: null,
      salary: null,
      sort: null,
      page: null,
      job: null
    });
    setMobileDetailOpen(false);
  }

  function selectJob(job: PublicJob) {
    onSelectJob(job);
    setMobileDetailOpen(true);
    requestAnimationFrame(() => { detailRef.current?.scrollTo({ top: 0 }); detailRef.current?.focus({ preventScroll: true }); });
  }
  const selectedLocation = params.get("location") ?? "";
  const workModeFilter = params.get("mode") ?? "";
  const experienceFilter = params.get("level") ?? "";
  const employmentTypeFilter = params.get("type") ?? "";
  const salaryFilter = params.get("salary") ?? "";
  const sortBy = params.get("sort") === "salary_desc" ? "salary_desc" : "newest";

  const setSelectedLocation = (value: string) => navigate({ location: value || null, page: null, job: null });
  const setWorkModeFilter = (value: string) => navigate({ mode: value || null, page: null, job: null });
  const setExperienceFilter = (value: string) => navigate({ level: value || null, page: null, job: null });
  const setEmploymentTypeFilter = (value: string) => navigate({ type: value || null, page: null, job: null });
  const setSalaryFilter = (value: string) => navigate({ salary: value || null, page: null, job: null });
  const setSortBy = (value: string) => navigate({ sort: value || null, page: null, job: null });
  useEffect(() => { setDraftKeyword(keyword); }, [keyword]);

  const salaryRange = SALARY_FILTER_OPTIONS[salaryFilter];
  const results = usePagedResource<PublicJob>("/api/v2/public/jobs", {
    q: keyword,
    companyId,
    location: selectedLocation,
    workMode: workModeFilter,
    seniority: experienceFilter,
    employmentType: employmentTypeFilter,
    minSalary: salaryRange?.min != null ? String(salaryRange.min) : "",
    maxSalary: salaryRange?.max != null ? String(salaryRange.max) : "",
    sort: sortBy
  }, undefined, 12, { page: Math.min(10000, Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0)), onChange: (page) => navigate({ page: page ? String(page) : null, job: null }) });
  const sortedJobs = results.items.map((job) => ({ ...job, skills: job.skills ?? extractSkillsFromJob(job.requirementsText, job.description, job.title) }));
  const loading = results.loading;

  const hasActiveFilters = Boolean(
    keyword || companyId || selectedLocation || workModeFilter || experienceFilter || employmentTypeFilter || salaryFilter || sortBy === "salary_desc"
  );

  const activeJob = selectedJobId ? sortedJobs.find((j) => j.jobId === selectedJobId) ?? (selectedJob?.jobId === selectedJobId ? selectedJob : null) : sortedJobs[0];

  return (
    <div id="split-search" className="portal-split-search-container">
      {/* 1. Top Mega Search & Filter Pills Bar */}
      <div className="split-top-filter-bar">
        <form className="filter-input-combo" role="search" onSubmit={(event) => { event.preventDefault(); setKeyword(draftKeyword); setMobileDetailOpen(false); }}>
          <div className="search-input-field">
            <SearchIcon size={19} aria-hidden="true" />
            <input
              type="text"
              maxLength={200}
              value={draftKeyword}
              onChange={(e) => setDraftKeyword(e.target.value)}
              placeholder="Nhập vị trí, ngôn ngữ lập trình (Java, React, Golang, AI...)"
              aria-label="Tìm kiếm việc làm"
            />
            {draftKeyword && (
              <button
                type="button"
                className="clear-search-btn"
                aria-label="Xóa từ khóa"
                onClick={() => { setDraftKeyword(""); setKeyword(""); }}
              >
                ✕
              </button>
            )}
          </div>

          <div className="location-select-field">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              aria-label="Địa điểm"
            >
              <option value="">Tất cả địa điểm</option>
              <option value="Hà Nội">Hà Nội</option>
              <option value="Hồ Chí Minh">TP. Hồ Chí Minh</option>
              <option value="Đà Nẵng">Đà Nẵng</option>
            </select>
          </div>

          <button type="submit" className="split-search-submit-btn">
            Tìm kiếm
          </button>
        </form>

        {/* Quick Filter Pills Row */}
        <div className="quick-filter-pills-row">
          <label className="filter-pill-label">
            <span>Mức lương:</span>
            <select
              className="pill-select"
              value={salaryFilter}
              onChange={(e) => setSalaryFilter(e.target.value)}
              aria-label="Lọc theo mức lương"
            >
              <option value="">Tất cả mức lương</option>
              <option value="under_15">Dưới 15 triệu</option>
              <option value="15_30">15 – 30 triệu</option>
              <option value="30_50">30 – 50 triệu</option>
              <option value="over_50">Trên 50 triệu</option>
            </select>
          </label>

          <label className="filter-pill-label">
            <span>Cấp bậc:</span>
            <select
              className="pill-select"
              value={experienceFilter}
              onChange={(e) => setExperienceFilter(e.target.value)}
            >
              <option value="">Tất cả cấp bậc</option>
              <option value="Fresher|Junior|Intern">Fresher / Junior / Intern</option>
              <option value="Chuyên viên|Middle">Chuyên viên</option>
              <option value="Senior|Leader|Lead|Trưởng nhóm">Senior / Leader</option>
            </select>
          </label>

          <label className="filter-pill-label">
            <span>Chế độ:</span>
            <select
              className="pill-select"
              value={workModeFilter}
              onChange={(e) => setWorkModeFilter(e.target.value)}
              aria-label="Lọc theo chế độ làm việc"
            >
              <option value="">Tất cả chế độ</option>
              <option value="REMOTE">Remote (Từ xa)</option>
              <option value="HYBRID">Hybrid (Linh hoạt)</option>
              <option value="ONSITE">Tại văn phòng</option>
            </select>
          </label>

          <label className="filter-pill-label">
            <span>Hình thức:</span>
            <select
              className="pill-select"
              value={employmentTypeFilter}
              onChange={(e) => setEmploymentTypeFilter(e.target.value)}
              aria-label="Lọc theo hình thức làm việc"
            >
              <option value="">Tất cả hình thức</option>
              <option value="FULL_TIME">Toàn thời gian</option>
              <option value="PART_TIME">Bán thời gian</option>
              <option value="CONTRACT">Hợp đồng</option>
              <option value="INTERNSHIP">Thực tập</option>
            </select>
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              className="filter-pill-reset-btn"
              onClick={resetFilters}
            >
              Xóa bộ lọc
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <div className="active-filter-chips-row" aria-label="Bộ lọc đang áp dụng">
            <span className="active-filter-caption">Đang lọc:</span>
            {keyword && (
              <span className="active-filter-chip">
                Từ khóa: <strong>{keyword}</strong>
                <button type="button" aria-label="Xóa từ khóa" onClick={() => { setDraftKeyword(""); setKeyword(""); }}>×</button>
              </span>
            )}
            {selectedLocation && (
              <span className="active-filter-chip">
                Địa điểm: <strong>{selectedLocation}</strong>
                <button type="button" aria-label="Xóa bộ lọc địa điểm" onClick={() => setSelectedLocation("")}>×</button>
              </span>
            )}
            {salaryFilter && SALARY_FILTER_OPTIONS[salaryFilter] && (
              <span className="active-filter-chip">
                Lương: <strong>{SALARY_FILTER_OPTIONS[salaryFilter].label}</strong>
                <button type="button" aria-label="Xóa bộ lọc mức lương" onClick={() => setSalaryFilter("")}>×</button>
              </span>
            )}
            {experienceFilter && (
              <span className="active-filter-chip">
                Cấp bậc: <strong>{experienceFilter.split("|")[0]}</strong>
                <button type="button" aria-label="Xóa bộ lọc cấp bậc" onClick={() => setExperienceFilter("")}>×</button>
              </span>
            )}
            {workModeFilter && (
              <span className="active-filter-chip">
                Chế độ: <strong>{workModeLabel(workModeFilter)}</strong>
                <button type="button" aria-label="Xóa bộ lọc chế độ làm việc" onClick={() => setWorkModeFilter("")}>×</button>
              </span>
            )}
            {employmentTypeFilter && (
              <span className="active-filter-chip">
                Hình thức: <strong>{employmentTypeLabel(employmentTypeFilter)}</strong>
                <button type="button" aria-label="Xóa bộ lọc hình thức làm việc" onClick={() => setEmploymentTypeFilter("")}>×</button>
              </span>
            )}
          </div>
        )}
      </div>

      {companyId && <div className="company-filter-summary">Việc làm tại <strong>{resolveCompanyMeta(companyId).name}</strong><button type="button" onClick={() => setCompanyId("")}>Bỏ lọc công ty ×</button></div>}

      {/* 2. Results Count & Sort Bar */}
      <div className="split-results-header">
        <div className="results-count-text" role="status">
          <strong>{results.total}</strong> kết quả việc làm
        </div>
        <div className="sort-pills-group">
          <button
            type="button"
            className={`sort-pill ${sortBy === "newest" ? "active" : ""}`}
            onClick={() => setSortBy("newest")}
          >
            Mới nhất
          </button>
          <button
            type="button"
            className={`sort-pill ${sortBy === "salary_desc" ? "active" : ""}`}
            onClick={() => setSortBy("salary_desc")}
          >
            Mức lương (Cao - Thấp)
          </button>
        </div>
      </div>

      {sortBy === "salary_desc" && <p className="muted">Sắp xếp theo mức lương tối đa niêm yết; chưa quy đổi tiền tệ hoặc kỳ trả lương.</p>}
      {results.error && <p role="alert">{results.error} <button type="button" onClick={results.refresh}>Thử lại</button></p>}
      {/* 3. The 2-Column Split View */}
      <div className={`split-view-layout ${mobileDetailOpen && activeJob ? "mobile-detail-open" : ""}`} aria-busy={loading}>
        {/* Left Column (40% width): Scrollable Job List */}
        <div className="split-left-list">
          {loading ? <p className="empty-search-state" role="status">Đang tải việc làm…</p> : sortedJobs.length === 0 ? (
            <div className="empty-search-state">
              <SearchIcon size={28} aria-hidden="true" />
              <p>Không tìm thấy việc làm phù hợp với tiêu chí lọc.</p>
              <button
                type="button"
                className="secondary-btn"
                onClick={resetFilters}
              >
                Đặt lại bộ lọc
              </button>
            </div>
          ) : (
            sortedJobs.map((job) => {
              const isSelected = activeJob?.jobId === job.jobId;
              const meta = resolveCompanyMeta(job.companyId, job.companyName);
              const logoSrc = job.companyLogo || meta.logo;

              return (
                <div
                  key={job.jobId}
                  className={`split-job-card ${isSelected ? "selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectJob(job)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectJob(job); }
                  }}
                >
                  <div className="split-card-header">
                    <div className="company-logo-box">
                      <img src={logoSrc} alt={`${meta.shortName} logo`} loading="lazy" />
                    </div>
                    <div className="company-title-wrap">
                      <h4 className="split-card-title">{job.title}</h4>
                      <span className="split-company-name">
                        {meta.name}
                      </span>
                    </div>
                  </div>

                  <div className="split-salary-highlight">{formatSalary(job)}</div>

                  <div className="split-card-meta">
                    <span>{job.locationText ?? "Linh hoạt"}</span>
                    <span className="dot">·</span>
                    <span>{seniorityLabel(job.seniorityLevel)}</span>
                    <span className="dot">·</span>
                    <span>{workModeLabel(job.workMode)}</span>
                    <span className="dot">·</span>
                    <span>{employmentTypeLabel(job.employmentType)}</span>
                  </div>

                  {job.skills && job.skills.length > 0 && (
                    <div className="split-card-tech-chips">
                      {job.skills.slice(0, 5).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="split-tech-chip"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDraftKeyword(s);
                            setKeyword(s);
                          }}
                          title={`Tìm việc với kỹ năng ${s}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="split-card-footer">
                    <span className="posted-time">
                      {publishedLabel(job)}
                    </span>
                    <span className="view-detail-hint">Bấm xem chi tiết ➔</span>
                  </div>
                </div>
              );
            })
          )}
          {!loading && sortedJobs.length > 0 && (
            <div className="split-pagination-container">
              <PageControls {...results} onPageChange={results.setPage} label="Phân trang tìm việc" />
            </div>
          )}
        </div>

        {/* Right Column (60% width): Sticky Detailed JD Pane */}
        {activeJob && (() => {
          const activeMeta = resolveCompanyMeta(activeJob.companyId, activeJob.companyName);
          const activeLogo = activeJob.companyLogo || activeMeta.logo;

          return (
            <aside ref={detailRef} tabIndex={-1} className="split-right-pane" aria-label="Chi tiết việc làm đã chọn">
              <button type="button" className="mobile-back-to-results" onClick={() => setMobileDetailOpen(false)}>← Quay lại kết quả</button>
              <CompanyCover src={activeMeta.coverImage} className="job-detail-cover" />
              <div className="sticky-jd-header">
                <div className="jd-header-top">
                  <div className="jd-company-badge-wrap">
                    <img src={activeLogo} alt={`${activeMeta.shortName} logo`} className="jd-company-mini-logo" />
                    <span className="jd-company-pill">
                      {activeMeta.name}
                    </span>
                  </div>
                  <span className="jd-openings-tag">{activeJob.openings} vị trí tuyển</span>
                </div>

                <h2 className="jd-title">{activeJob.title}</h2>

                <div className="jd-salary-row">
                  <span className="jd-salary-val">{formatSalary(activeJob)}</span>
                  <span className="jd-negotiable-badge">
                    {activeJob.salaryNegotiable ? "Thỏa thuận" : "Thông tin từ nhà tuyển dụng"}
                  </span>
                </div>

              <div className="jd-meta-tags">
                <span className="meta-tag">{activeJob.locationText ?? "Linh hoạt"}</span>
                <span className="meta-tag"><JobsIcon size={14} aria-hidden="true" /> {seniorityLabel(activeJob.seniorityLevel)}</span>
                <span className="meta-tag"><CompanyIcon size={14} aria-hidden="true" /> {workModeLabel(activeJob.workMode)}</span>
                <span className="meta-tag">{employmentTypeLabel(activeJob.employmentType)}</span>
              </div>

              <div className="jd-cta-action-row">
                <button
                  type="button"
                  className="jd-big-apply-btn"
                  onClick={() => { setMobileDetailOpen(false); onApplyJob(activeJob); }}
                >
                  Ứng tuyển ngay
                </button>
              </div>
            </div>

            {/* Structured JD Sections */}
            <div className="sticky-jd-scrollable-body">
              <section className="jd-section-block">
                <h3 className="section-title-num">
                  <span className="num-badge">1</span> Vai trò & trách nhiệm của bạn
                </h3>
                <div className="section-text-content">
                  <p>{activeJob.description}</p>
                </div>
              </section>

              <section className="jd-section-block">
                <h3 className="section-title-num">
                  <span className="num-badge">2</span> Kỹ năng & trình độ của bạn
                </h3>
                <div className="section-text-content">
                  <p>{activeJob.requirementsText}</p>
                </div>
              </section>

              {activeJob.benefitsText && (
                <section className="jd-section-block">
                  <h3 className="section-title-num">
                    <span className="num-badge">3</span> Quyền lợi & đãi ngộ
                  </h3>
                  <div className="section-text-content">
                    <p>{activeJob.benefitsText}</p>
                  </div>
                </section>
              )}

              {/* DATN AI Showcase block: Pre-Apply Match Assessment */}
              <PreApplyMatchWidget
                job={activeJob}
                session={session}
                onApplyJob={onApplyJob}
                onRequireLogin={onRequireLogin}
                onOpenCvLibrary={onOpenCvLibrary}
              />
            </div>
          </aside>
          );
        })()}
      </div>
    </div>
  );
}
