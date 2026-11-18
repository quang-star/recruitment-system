import { ArrowRightIcon, MapPinIcon } from "../../shared/components/Icon";
import { Card } from "../../shared/ui";
import { CompanyCover } from "./CompanyCover";
import { CompanyLogo } from "./CompanyLogo";
import { CompanyInfo, FEATURED_COMPANIES } from "./companyData";

type FeaturedEmployersProps = {
  companies?: CompanyInfo[];
  onSelectCompany?: (companyName: string) => void;
};

export function FeaturedEmployers({ companies, onSelectCompany }: FeaturedEmployersProps) {
  const employers = companies ?? FEATURED_COMPANIES;
  if (!employers.length) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-10">
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight text-ink-900 m-0">
          Khám phá nhà tuyển dụng
        </h2>
        <p className="text-sm text-ink-500 mt-1 mb-0">
          Doanh nghiệp và cơ hội tuyển dụng đang mở
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {employers.slice(0, 6).map((company) => (
          <Card key={company.id} as="article" interactive padding="none" className="flex flex-col overflow-hidden">
            <CompanyCover src={company.coverImage} className="h-28 w-full" />
            <div className="relative -mt-7 flex flex-1 flex-col gap-3 px-4 pb-4">
              <CompanyLogo
                src={company.logo}
                name={company.shortName || company.name}
                className="h-14 w-14 rounded-xl border-2 border-white shadow-card"
              />
              <div className="min-w-0">
                <h3 className="text-base font-bold text-ink-900 m-0 truncate">{company.shortName || company.name}</h3>
                <p className="text-sm text-ink-500 m-0 mt-1 flex items-center gap-1 truncate">
                  <MapPinIcon size={13} aria-hidden="true" />
                  <span className="truncate">{company.location}</span>
                </p>
                {company.openJobsCount != null && (
                  <p className="text-sm font-semibold text-emerald-700 m-0 mt-1.5">
                    {company.openJobsCount} vị trí đang mở
                  </p>
                )}
              </div>

              {onSelectCompany && (
                <div className="mt-auto pt-3 border-t border-border-subtle/80">
                  <button
                    type="button"
                    onClick={() => onSelectCompany(company.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800 cursor-pointer bg-transparent border-0 p-0"
                  >
                    <span>Xem việc làm tại {company.shortName || company.name}</span>
                    <ArrowRightIcon size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
