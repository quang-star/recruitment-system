import { LayersIcon } from "../../shared/components/Icon";
import { JobDiscoveryCategory } from "./types";

type HotIndustriesProps = {
  categories: JobDiscoveryCategory[];
  onSelectCategory?: (category: JobDiscoveryCategory) => void;
};

export function HotIndustries({ categories, onSelectCategory }: HotIndustriesProps) {
  if (!categories.length) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
      <div className="rounded-xl border border-border-subtle bg-white p-6 sm:p-8 shadow-card">
        <div className="mb-5">
          <h2 className="text-xl font-bold tracking-tight text-ink-900 m-0">
            Khám phá theo chuyên môn
          </h2>
          <p className="text-sm text-ink-500 mt-1 mb-0">
            Nhóm ngành nghề đang có vị trí mở tuyển thực tế
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map((cat) => (
            <button
              key={`${cat.industryId}:${cat.specializationId ?? ""}`}
              type="button"
              onClick={() => onSelectCategory?.(cat)}
              className="group flex items-center gap-3 rounded-lg border border-border-subtle bg-slate-50/70 p-3.5 text-left hover:border-brand-300 hover:bg-brand-50/50 transition-colors cursor-pointer"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white border border-border-subtle text-brand-700 group-hover:border-brand-200 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                <LayersIcon size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-sm sm:text-base font-bold text-ink-900">{cat.name}</strong>
                <span className="block text-xs sm:text-sm text-ink-500 mt-0.5">{cat.jobCount} việc làm</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
