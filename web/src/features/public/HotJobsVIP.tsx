import { formatSalary, employmentTypeLabel } from "./jobPresentation";
import { PublicJob } from "./types";
import { resolveCompanyMeta } from "./companyData";

type HotJobsVIPProps = {
  jobs: PublicJob[];
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
};

export function HotJobsVIP({ jobs, onSelectJob, onApplyJob }: HotJobsVIPProps) {
  const vipJobs = jobs.slice(0, 6);

  return (
    <section className="portal-section hot-vip-jobs-section">
      <div className="portal-container">
        <div className="section-title-row">
          <div>
            <h2 className="portal-section-title">VIỆC LÀM MỚI NHẤT</h2>
            <span className="section-subtext">Những vị trí IT vừa được đăng tuyển dụng trên SmartHire</span>
          </div>
          <div className="vip-badge-pill">MỚI ĐĂNG</div>
        </div>

        <div className="portal-jobs-3col-grid">
          {vipJobs.map((job) => {
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
                    <span className="job-card-badge-status">Đang tuyển</span>
                  </div>
                </div>

                <h3 className="job-card-title" title={job.title}>{job.title}</h3>

                <div className="job-card-salary-wrap">
                  <span className="job-salary-highlight">{formatSalary(job)}</span>
                </div>

                <div className="job-card-meta-row">
                  <span className="meta-item">📍 {job.locationText ?? "Linh hoạt"}</span>
                  <span className="meta-dot">·</span>
                  <span className="meta-item">{employmentTypeLabel(job.employmentType)}</span>
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
                  <button
                    type="button"
                    className="job-card-apply-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyJob(job);
                    }}
                  >
                    Ứng tuyển ngay
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
