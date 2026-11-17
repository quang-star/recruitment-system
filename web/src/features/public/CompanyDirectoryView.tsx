import { useState } from "react";
import { ArrowRightIcon, CompanyIcon, MapPinIcon, SearchIcon } from "../../shared/components/Icon";
import { Badge, Card, EmptyState } from "../../shared/ui";
import { CompanyCover } from "./CompanyCover";
import { CompanyLogo } from "./CompanyLogo";
import { CompanyInfo } from "./companyData";

type CompanyDirectoryViewProps = {
  companies: CompanyInfo[];
  onSelectCompany: (companyId: string) => void;
};

export function CompanyDirectoryView({ companies, onSelectCompany }: CompanyDirectoryViewProps) {
  const [search, setSearch] = useState("");
  const normalized = search.trim().toLowerCase();
  const filtered = normalized
    ? companies.filter(
        (c) =>
          (c.shortName || c.name).toLowerCase().includes(normalized) ||
          c.location.toLowerCase().includes(normalized) ||
          c.description.toLowerCase().includes(normalized)
      )
    : companies;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-border-subtle pb-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0 mb-1">
            Doanh nghiệp đối tác
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900 m-0">
            Tìm hiểu nhà tuyển dụng
          </h1>
          <p className="text-sm text-ink-500 mt-1 mb-0">
            Khám phá thông tin doanh nghiệp và các vị trí đang tuyển dụng trực tiếp
          </p>
        </div>

        <div className="relative w-full sm:w-80">
          <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            aria-label="Tìm công ty theo tên hoặc địa điểm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên công ty, địa điểm…"
            className="h-10 w-full rounded-xl border border-border-strong bg-white pl-10 pr-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CompanyIcon size={24} />}
          title="Chưa tìm thấy công ty phù hợp"
          description="Thử tìm theo tên khác hoặc xóa từ khóa tìm kiếm."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((company) => (
            <Card key={company.id} as="article" interactive padding="none" className="overflow-hidden flex flex-col">
              <CompanyCover src={company.coverImage} className="h-32 w-full" />

              <div className="p-5 flex-1 flex flex-col justify-between gap-4 -mt-8 relative">
                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <CompanyLogo
                      src={company.logo}
                      name={company.shortName || company.name}
                      className="h-14 w-14 rounded-lg border-2 border-white shadow-card"
                      textClassName="text-sm font-bold"
                    />
                    {company.openJobsCount != null && (
                      <Badge tone="brand">{company.openJobsCount} việc làm</Badge>
                    )}
                  </div>

                  <div>
                    <h2 className="text-base font-bold text-ink-900 m-0 truncate">
                      {company.shortName || company.name}
                    </h2>
                    <p className="text-xs text-ink-500 mt-1 mb-0 flex items-center gap-1 truncate">
                      <MapPinIcon size={12} aria-hidden="true" />
                      <span className="truncate">{company.location}</span>
                    </p>
                  </div>

                  <p className="text-xs sm:text-sm text-ink-600 m-0 line-clamp-2 leading-relaxed">
                    {company.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-border-subtle/80">
                  <button
                    type="button"
                    onClick={() => onSelectCompany(company.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800 cursor-pointer bg-transparent border-0 p-0"
                  >
                    <span>Xem hồ sơ công ty</span>
                    <ArrowRightIcon size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
