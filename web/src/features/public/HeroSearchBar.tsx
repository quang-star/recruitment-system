import { FC } from "react";
import { SearchIcon, SparklesIcon } from "../../shared/components/Icon";

type Props = {
  keyword: string;
  onKeywordChange: (val: string) => void;
  location: string;
  onLocationChange: (val: string) => void;
  workMode: string;
  onWorkModeChange: (val: string) => void;
  onSearch: () => void;
  totalJobs: number;
};

const popularSkills = [
  "Java", "Spring Boot", "Kafka", "ReactJS", "Python", "Node.js", "Docker", "PostgreSQL", "AWS"
];

export const HeroSearchBar: FC<Props> = ({
  keyword,
  onKeywordChange,
  location,
  onLocationChange,
  workMode,
  onWorkModeChange,
  onSearch,
  totalJobs
}) => {
  return (
    <section className="portal-hero-section">
      <div className="portal-hero-container">
        <div className="hero-top-badge">
          <SparklesIcon size={14} />
          <span>HỆ THỐNG TUYỂN DỤNG IT THÔNG MINH DỰA TRÊN AI & MICROSERVICES</span>
        </div>

        <h1 className="portal-hero-title">
          Tìm kiếm cơ hội việc làm IT hàng đầu <br />
          <span className="hero-gradient-text">Đối sánh kỹ năng chính xác với AI Matching</span>
        </h1>

        <p className="portal-hero-desc">
          Nền tảng hỗ trợ phân tích CV tự động (OCR & NLP), đối sánh kinh nghiệm thực tế với yêu cầu công việc và trích dẫn bằng chứng xác thực từng trang hồ sơ.
        </p>

        {/* Mega Search Bar */}
        <div className="mega-search-bar">
          <div className="search-input-field">
            <SearchIcon size={20} className="field-icon" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder="Chức danh, từ khóa hoặc kỹ năng (Java, React, Kafka...)"
              aria-label="Từ khóa việc làm"
            />
          </div>

          <div className="search-select-field">
            <select
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              aria-label="Địa điểm làm việc"
            >
              <option value="">Tất cả địa điểm</option>
              <option value="Hà Nội">Hà Nội</option>
              <option value="Hồ Chí Minh">TP. Hồ Chí Minh</option>
              <option value="Đà Nẵng">Đà Nẵng</option>
              <option value="Remote">Làm việc từ xa (Remote)</option>
            </select>
          </div>

          <div className="search-select-field">
            <select
              value={workMode}
              onChange={(e) => onWorkModeChange(e.target.value)}
              aria-label="Hình thức làm việc"
            >
              <option value="">Tất cả hình thức</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
              <option value="ONSITE">Tại văn phòng</option>
            </select>
          </div>

          <button type="button" className="mega-search-btn" onClick={onSearch}>
            <SearchIcon size={18} />
            <span>Tìm việc ({totalJobs})</span>
          </button>
        </div>

        {/* Popular skill tags */}
        <div className="popular-tags-row">
          <span className="tags-label">Kỹ năng tìm kiếm nhiều:</span>
          <div className="tags-list">
            {popularSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                className={`skill-chip ${keyword.toLowerCase() === skill.toLowerCase() ? "active" : ""}`}
                onClick={() => {
                  onKeywordChange(skill);
                  onSearch();
                }}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
