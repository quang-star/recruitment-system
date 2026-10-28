import { JobsIcon, SparklesIcon, CvIcon, CheckCircleIcon } from "../../shared/components/Icon";
import { useState } from "react";

type PortalHeroBannerProps = {
  jobCount: number;
  onExploreClick: () => void;
  onUploadCv: () => void;
  onSearch?: (keyword: string, location?: string) => void;
  signedIn?: boolean;
};

export function PortalHeroBanner({ jobCount, onExploreClick, onUploadCv, onSearch, signedIn = false }: PortalHeroBannerProps) {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");

  const hotKeywords = ["Java", "React", "Python", "Golang", "Tester", "DevOps"];

  return (
    <section className="portal-hero-banner-section job-first-hero">
      <div className="portal-container">
        {/* Main Hero Search Card */}
        <div className="portal-hero-card modern-hero-card">
          <div className="hero-banner-content">
            <div className="hero-badge-pill">
              <span className="hero-badge-dot" />
              <span>VIỆC LÀM IT · CƠ HỘI NGHỀ NGHIỆP HÀNG ĐẦU</span>
            </div>
            <h1 className="hero-banner-title">
              Tìm công việc IT<br />tiếp theo của bạn.
            </h1>
            <p className="hero-banner-desc">
              Khám phá hàng trăm vị trí tuyển dụng công nghệ chất lượng cao, phân tích độ phù hợp CV bằng AI thông minh và giải trình minh bạch.
            </p>

            <form
              className="hero-job-search-box"
              aria-label="Tìm cơ hội nghề nghiệp"
              onSubmit={(event) => {
                event.preventDefault();
                onSearch?.(keyword.trim(), location);
              }}
            >
              <div className="search-box-input-group">
                <span className="search-input-icon" aria-hidden="true">🔍</span>
                <input
                  aria-label="Vị trí hoặc kỹ năng"
                  value={keyword}
                  maxLength={200}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="Vị trí, kỹ năng (ví dụ: Java, React, DevOps) hoặc công ty..."
                />
              </div>

              <div className="search-box-select-group">
                <span className="search-select-icon" aria-hidden="true">📍</span>
                <select
                  aria-label="Địa điểm làm việc"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                >
                  <option value="">Tất cả địa điểm</option>
                  <option value="Hà Nội">Hà Nội</option>
                  <option value="Hồ Chí Minh">TP. Hồ Chí Minh</option>
                  <option value="Đà Nẵng">Đà Nẵng</option>
                </select>
              </div>

              <button type="submit" className="hero-search-submit-btn">
                Tìm việc ngay
              </button>
            </form>

            <div className="hero-popular-searches">
              <span className="popular-label">Gợi ý từ khóa:</span>
              {hotKeywords.map((skill) => (
                <button
                  type="button"
                  key={skill}
                  className="popular-skill-tag"
                  onClick={() => onSearch?.(skill, location)}
                >
                  {skill}
                </button>
              ))}
            </div>

            <div className="hero-cta-row">
              <span className="campaign-job-count">
                <JobsIcon size={17} aria-hidden="true" />
                {jobCount > 0 ? `${jobCount} vị trí đang tuyển` : "Tìm cơ hội dành cho bạn"}
              </span>
              <button type="button" className="hero-view-all" onClick={onExploreClick}>
                Xem tất cả việc làm <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>

        {/* AI Matching Spotlight Feature Card */}
        <div className="portal-ai-spotlight-card">
          <div className="ai-spotlight-header">
            <div className="ai-spotlight-badge">
              <SparklesIcon size={16} aria-hidden="true" />
              <span>SMART MATCH ENGINE</span>
            </div>
            <h2 className="ai-spotlight-title">Hiểu rõ sự phù hợp của bạn</h2>
            <p className="ai-spotlight-subtitle">
              Tải CV để phân tích kỹ năng và đối chiếu với yêu cầu tuyển dụng.
            </p>
          </div>

          <div className="ai-spotlight-features">
            <div className="ai-feature-pill">
              <CvIcon size={18} aria-hidden="true" />
              <span>Bóc tách CV tự động (OCR & NLP)</span>
            </div>
            <div className="ai-feature-pill">
              <SparklesIcon size={18} aria-hidden="true" />
              <span>Đối soát IT Taxonomy chuẩn xác</span>
            </div>
            <div className="ai-feature-pill">
              <CheckCircleIcon size={18} aria-hidden="true" />
              <span>Giải trình minh chứng có căn cứ</span>
            </div>
          </div>

          <div className="ai-spotlight-action">
            <button type="button" className="ai-spotlight-btn" onClick={onUploadCv}>
              {signedIn ? "Quản lý CV của tôi" : "Tạo hồ sơ của tôi"} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
