import { useState } from "react";
import { FEATURED_COMPANIES, CompanyInfo } from "./companyData";
import { CompanyCover } from "./CompanyCover";

type CompanyDirectoryViewProps = {
  companies?: CompanyInfo[];
  onSelectCompany: (companyName: string) => void;
};

export function CompanyDirectoryView({ companies, onSelectCompany }: CompanyDirectoryViewProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");

  const sourceList = companies ?? FEATURED_COMPANIES;

  const filteredCompanies = sourceList.filter((c) => {
    const norm = searchTerm.trim().toLowerCase();
    const matchText =
      !norm ||
      `${c.name} ${c.shortName} ${c.tag} ${c.description}`.toLowerCase().includes(norm);
    const matchCity = !selectedCity || c.location.toLowerCase().includes(selectedCity.toLowerCase());
    return matchText && matchCity;
  });

  return (
    <div className="portal-companies-page">
      <div className="portal-container">
        {/* Header Banner */}
        <div className="companies-header-banner">
          <span className="companies-eyebrow">DOANH NGHIỆP TUYỂN DỤNG</span>
          <h1 className="companies-headline">Tìm hiểu nhà tuyển dụng</h1>
          <p className="companies-subtext">
            Xem thông tin do doanh nghiệp cung cấp và các vị trí đang tuyển.
          </p>

          {/* Quick search & filter bar */}
          <div className="companies-filter-bar">
            <div className="companies-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm công ty theo tên, ngành nghề (VNPT, FPT, AI, Fintech...)"
                aria-label="Tìm kiếm công ty"
              />
              {searchTerm && (
                <button type="button" className="clear-btn" onClick={() => setSearchTerm("")}>
                  ✕
                </button>
              )}
            </div>

            <div className="companies-city-select">
              <span className="location-icon">📍</span>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                aria-label="Lọc theo thành phố"
              >
                <option value="">Tất cả địa điểm</option>
                <option value="Hà Nội">Hà Nội</option>
                <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
                <option value="Đà Nẵng">Đà Nẵng</option>
              </select>
            </div>
          </div>
        </div>

        {/* Company Showcase Grid */}
        {filteredCompanies.length === 0 && <p className="portal-data-message" role="status">Không có công ty phù hợp. Hãy thử từ khóa hoặc địa điểm khác.</p>}
        <div className="companies-cards-grid">
          {filteredCompanies.map((comp: CompanyInfo) => (
            <div key={comp.id} className="company-showcase-card">
              <CompanyCover src={comp.coverImage} className="company-photo-wrap">
                <span className="company-open-badge">{comp.openJobsCount === null ? "Xem vị trí đang tuyển" : `🔥 ${comp.openJobsCount} vị trí đang tuyển`}</span>
              </CompanyCover>

              {/* Logo Badge Overlay */}
              <div className="company-card-middle">
                <div className="company-logo-pill">
                  <img src={comp.logo} alt={`${comp.shortName} logo`} />
                </div>
                <div className="company-meta-texts">
                  <h3 className="company-title">{comp.name}</h3>
                  <span className="company-tag-pill">{comp.tag}</span>
                </div>
              </div>

              {/* Company Description */}
              <p className="company-desc-text">{comp.description}</p>

              {/* Highlights & Facts */}
              <div className="company-facts-row">
                <span className="fact-item">📍 {comp.location}</span>
                <span className="fact-item">👥 {comp.size}</span>
              </div>

              {/* Action Button */}
              <div className="company-card-action">
                <button
                  type="button"
                  className="company-view-jobs-btn"
                  onClick={() => onSelectCompany(comp.id)}
                >
                  Xem các vị trí đang tuyển ➔
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
