type HotIndustriesProps = {
  onSelectCategory?: (category: string) => void;
};

export function HotIndustries({ onSelectCategory }: HotIndustriesProps) {
  const industries = [
    { title: "IT / Lập trình", query: "Developer", count: "Khám phá việc làm", icon: "< >", color: "#184dfb" },
    { title: "AI & Data Science", query: "AI", count: "Khám phá việc làm", icon: "🧠", color: "#7c3aed" },
    { title: "Cloud & DevOps", query: "Cloud", count: "Khám phá việc làm", icon: "☁️", color: "#0284c7" },
    { title: "Quản trị dự án (PM/PO)", query: "Project", count: "Khám phá việc làm", icon: "📊", color: "#059669" },
    { title: "Kiểm thử phần mềm (QA)", query: "QA", count: "Khám phá việc làm", icon: "🔍", color: "#d97706" },
    { title: "Thiết kế UI/UX", query: "UI/UX", count: "Khám phá việc làm", icon: "🎨", color: "#e11d48" },
  ];

  return (
    <section className="portal-section hot-industries-section">
      <div className="portal-container">
        <div className="hot-industries-box">
          <div className="industries-header">
            <h2 className="industries-title">Khám phá theo chuyên môn</h2>
            <p className="industries-subtitle">
              Tìm kiếm công việc phù hợp với chuyên môn công nghệ của bạn
            </p>
          </div>

          <div className="industries-grid">
            {industries.map((ind) => (
              <button
                key={ind.title}
                type="button"
                className="industry-item-card"
                onClick={() => onSelectCategory?.(ind.query)}
              >
                <div className="industry-icon-circle" style={{ color: ind.color }}>
                  {ind.icon}
                </div>
                <strong className="industry-name">{ind.title}</strong>
                <span className="industry-count">{ind.count} ➔</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
