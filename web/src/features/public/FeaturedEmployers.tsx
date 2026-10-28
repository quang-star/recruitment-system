import { FEATURED_COMPANIES, CompanyInfo } from "./companyData";
import { CompanyCover } from "./CompanyCover";

type FeaturedEmployersProps = {
  companies?: CompanyInfo[];
  onSelectCompany?: (companyName: string) => void;
};

export function FeaturedEmployers({ companies, onSelectCompany }: FeaturedEmployersProps) {
  const employers = companies ?? FEATURED_COMPANIES;

  return (
    <section className="portal-section featured-employers-section">
      <div className="portal-container">
        <div className="section-title-row">
          <div>
            <h2 className="portal-section-title">KHÁM PHÁ NHÀ TUYỂN DỤNG</h2>
            <span className="section-subtext">Doanh nghiệp và cơ hội tuyển dụng trên SmartHire</span>
          </div>
          <button
            type="button"
            className="section-link-action-btn"
            onClick={() => onSelectCompany?.("")}
          >
            Xem tất cả doanh nghiệp ➔
          </button>
        </div>

        <div className="employers-cards-row">
          {employers.map((emp) => (
            <div
              key={emp.id}
              aria-label={`Xem việc làm tại ${emp.shortName}`} className="employer-spotlight-card"
              role="button"
              tabIndex={0}
              onClick={() => onSelectCompany?.(emp.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectCompany?.(emp.id); }
              }}
            >
              <CompanyCover src={emp.coverImage} className="emp-cover-thumb">
                <span className="emp-jobs-count-tag">{emp.openJobsCount === null ? "Xem việc làm" : `${emp.openJobsCount} việc làm`}</span>
              </CompanyCover>

              {/* Logo & Identity */}
              <div className="emp-card-body">
                <div className="emp-logo-badge">
                  <img src={emp.logo} alt={`${emp.shortName} logo`} loading="lazy" />
                </div>
                <strong className="emp-name" title={emp.name}>{emp.shortName}</strong>
                <span className="emp-tag">{emp.tag}</span>
                <small className="emp-location">📍 {emp.location}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
