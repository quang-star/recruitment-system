import { useState } from "react";
import { MapPinIcon, SearchIcon } from "../../shared/components/Icon";

type PortalHeroBannerProps = {
  onExploreClick: () => void;
  onUploadCv: () => void;
  onSearch?: (keyword: string, location?: string) => void;
  signedIn?: boolean;
  locations: string[];
  suggestedKeywords: string[];
};

export function PortalHeroBanner({
  onExploreClick,
  onUploadCv,
  onSearch,
  signedIn = false,
  locations,
  suggestedKeywords
}: PortalHeroBannerProps) {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (onSearch) onSearch(keyword.trim(), location);
    else onExploreClick();
  }

  return (
    <section className="border-b border-border-subtle bg-slate-50/70 py-6 sm:py-9">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl space-y-4 text-left">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900 leading-tight m-0">
              Tìm việc theo kỹ năng và địa điểm
            </h1>
            <p className="text-sm sm:text-base text-ink-600 max-w-2xl m-0">
              Lọc nhanh theo chức danh, kỹ năng hoặc tỉnh thành và đối chiếu CV trước khi ứng tuyển.
            </p>
          </div>

          <form
            role="form"
            aria-label="Tìm cơ hội nghề nghiệp"
            onSubmit={submitSearch}
            className="rounded-lg border border-border-strong bg-white p-1.5 shadow-card flex flex-col md:flex-row items-stretch gap-1.5"
          >
            <div className="flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 focus-within:bg-slate-50">
              <SearchIcon size={17} className="text-ink-400 shrink-0" aria-hidden="true" />
              <input
                type="text"
                aria-label="Vị trí hoặc kỹ năng"
                placeholder="Chức danh, kỹ năng hoặc tên công ty…"
                value={keyword}
                maxLength={200}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full border-0 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
              />
            </div>

            <div className="hidden md:block w-px bg-border-subtle my-1.5" aria-hidden="true" />

            <div className="flex md:w-48 items-center gap-2 rounded-md px-3 py-2 border-t md:border-t-0 border-border-subtle focus-within:bg-slate-50">
              <MapPinIcon size={17} className="text-ink-400 shrink-0" aria-hidden="true" />
              <select
                aria-label="Địa điểm làm việc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full border-0 bg-transparent text-sm text-ink-800 focus:outline-none cursor-pointer"
              >
                <option value="">Tất cả địa điểm</option>
                {locations.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer shrink-0"
            >
              Tìm việc
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs sm:text-sm">
            {suggestedKeywords.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-ink-500 mr-0.5">Tìm nhanh:</span>
                {suggestedKeywords.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => (onSearch ? onSearch(term, location) : onExploreClick())}
                    className="rounded-md border border-border-subtle bg-white px-2.5 py-1 text-xs font-medium text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors cursor-pointer"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}

            {signedIn && (
              <button
                type="button"
                onClick={onUploadCv}
                className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-4 cursor-pointer bg-transparent border-0 p-0"
              >
                <span>Quản lý CV của tôi</span>
                <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
