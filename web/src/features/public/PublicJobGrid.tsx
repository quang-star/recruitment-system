import { FC } from "react";
import { PublicJob } from "./types";
import { SparklesIcon } from "../../shared/components/Icon";

type Props = {
  jobs: PublicJob[];
  loading: boolean;
  onSelectJob: (job: PublicJob) => void;
  onApplyJob: (job: PublicJob) => void;
};

const commonTechs = [
  "Java", "Kafka", "Spring Boot", "React", "Python", "Docker", "PostgreSQL",
  "AWS", "TypeScript", "Node.js", "AI", "Go", "SQL", "Redis", "Microservices"
];

function extractSkills(text: string): string[] {
  return commonTechs.filter((tech) => new RegExp(`\\b${tech}\\b`, "i").test(text));
}

function formatSalary(job: PublicJob): string {
  if (job.salaryNegotiable || (!job.salaryMin && !job.salaryMax)) return "Thỏa thuận";
  const currency = job.salaryCurrency === "VND" ? "₫" : "$";
  if (job.salaryMin && job.salaryMax) {
    return `${currency}${job.salaryMin.toLocaleString()} - ${job.salaryMax.toLocaleString()}`;
  }
  if (job.salaryMin) return `Từ ${currency}${job.salaryMin.toLocaleString()}`;
  return `Lên đến ${currency}${job.salaryMax?.toLocaleString()}`;
}

function translateWorkMode(mode: string | null): string {
  switch (mode) {
    case "REMOTE": return "Remote";
    case "HYBRID": return "Hybrid";
    case "ONSITE": return "Tại văn phòng";
    default: return "Linh hoạt";
  }
}

export const PublicJobGrid: FC<Props> = ({ jobs, loading, onSelectJob, onApplyJob }) => {
  if (loading) {
    return (
      <section className="featured-jobs-section" id="featured-jobs">
        <div className="section-container">
          <div className="section-title-wrap">
            <h2>Việc làm IT nổi bật</h2>
            <p className="muted">Đang tải danh sách cơ hội việc làm…</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="featured-jobs-section" id="featured-jobs">
      <div className="section-container">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">CƠ HỘI NGHỀ NGHIỆP</span>
            <h2>Việc làm IT đang tuyển dụng</h2>
          </div>
          <span className="job-count-badge">{jobs.length} Vị trí mở</span>
        </div>

        {jobs.length === 0 ? (
          <div className="empty-jobs-card">
            <p className="muted">Hiện chưa có việc làm nào phù hợp với bộ lọc tìm kiếm của bạn.</p>
          </div>
        ) : (
          <div className="portal-jobs-grid">
            {jobs.map((job) => {
              const skills = extractSkills(`${job.title} ${job.requirementsText}`).slice(0, 4);
              return (
                <article key={job.jobId} className="portal-job-card">
                  <div className="job-card-top">
                    <div className="company-logo-placeholder">
                      <span>{job.title.slice(0, 1).toUpperCase()}</span>
                    </div>
                    <div className="job-card-header-info">
                      <span className="company-badge-name">IT Technology Partner</span>
                      <h3 className="job-card-title" onClick={() => onSelectJob(job)}>
                        {job.title}
                      </h3>
                      <div className="job-meta-row">
                        <span className="meta-loc">{job.locationText ?? "Toàn quốc"}</span>
                        <span className="meta-sep">·</span>
                        <span className="meta-mode">{translateWorkMode(job.workMode)}</span>
                        <span className="meta-sep">·</span>
                        <span className="meta-salary">{formatSalary(job)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="job-card-tags">
                    {skills.map((skill) => (
                      <span key={skill} className="tech-chip">{skill}</span>
                    ))}
                  </div>

                  <div className="job-card-footer">
                    <span className="ai-match-pill">
                      <SparklesIcon size={13} />
                      <span>Hỗ trợ AI Matching</span>
                    </span>

                    <div className="card-btn-actions">
                      <button
                        type="button"
                        className="secondary-button card-btn"
                        onClick={() => onSelectJob(job)}
                      >
                        Chi tiết
                      </button>
                      <button
                        type="button"
                        className="card-btn apply-btn"
                        onClick={() => onApplyJob(job)}
                      >
                        Ứng tuyển
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
