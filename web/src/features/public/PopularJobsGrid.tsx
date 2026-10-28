import { formatSalary, employmentTypeLabel, seniorityLabel, publishedLabel } from "./jobPresentation";
import { PublicJob } from "./types";
import { resolveCompanyMeta } from "./companyData";

type PopularJobsGridProps = {
  jobs: PublicJob[];
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
};

export function PopularJobsGrid({ jobs, onSelectJob, onApplyJob }: PopularJobsGridProps) {
  if (!jobs.length) return null;
  return (
    <section className="portal-section popular-jobs-section">
      <div className="portal-container">
        <div className="section-title-row">
          <div>
            <h2 className="portal-section-title">THÊM CƠ HỘI CHO BẠN</h2>
            <span className="section-subtext">Các vị trí công nghệ đang được tuyển dụng hấp dẫn</span>
          </div>
          <span className="job-count-badge">{jobs.length} việc làm</span>
        </div>

        <div className="portal-jobs-3col-grid">
          {jobs.map((job) => {
            const meta = resolveCompanyMeta(job.companyId, job.companyName);
            const logoSrc = job.companyLogo || meta.logo;

            return (
              <div
                key={job.jobId}
                className="portal-modern-job-card"
                role="button"
                tabIndex={0}
                onClick={() => onSelectJob(job)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelectJob(job); } }}
              >
                <div className="card-header-flex">
                  <div className="job-card-logo-wrap">
                    <img src={logoSrc} alt={`${meta.shortName} logo`} loading="lazy" />
                  </div>
                  <div className="job-card-header-info">
                    <span className="job-card-company-name" title={meta.name}>{meta.shortName}</span>
                    <span className="card-time-ago">{publishedLabel(job)}</span>
                  </div>
                </div>

                <h3 className="job-card-title" title={job.title}>{job.title}</h3>

                <div className="job-card-salary-wrap">
                  <span className="job-salary-highlight">{formatSalary(job)}</span>
                </div>

                <div className="job-card-meta-row">
                  <span className="meta-item">📍 {job.locationText ?? "Linh hoạt"}</span>
                  <span className="meta-dot">·</span>
                  <span className="meta-item">{seniorityLabel(job.seniorityLevel)}</span>
                </div>

                {job.skills && job.skills.length > 0 ? (
                  <div className="job-card-skills-row">
                    {job.skills.slice(0, 3).map((s) => (
                      <span key={s} className="skill-chip">{s}</span>
                    ))}
                    {job.skills.length > 3 && (
                      <span className="skill-chip-more">+{job.skills.length - 3}</span>
                    )}
                  </div>
                ) : (
                  <div className="job-card-skills-placeholder" />
                )}

                <div className="job-card-footer-action">
                  <span className="work-type-pill">{employmentTypeLabel(job.employmentType)}</span>
                  <button
                    type="button"
                    className="job-card-apply-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyJob(job);
                    }}
                  >
                    Ứng tuyển
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
