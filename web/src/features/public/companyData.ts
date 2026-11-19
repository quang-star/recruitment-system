import { PublicJob } from "./types";

export type PublicCompany = {
  companyId: string;
  legalName: string;
  displayName: string;
  slug: string;
  description: string;
  websiteUrl: string;
  countryCode: string;
  registrationNumber?: string;
  sizeRange?: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  status: string;
  verificationStatus: string;
  version: number;
};

export type CompanyInfo = {
  id: string;
  name: string;
  shortName: string;
  tag: string;
  logo: string;
  coverImage: string;
  slug: string;
  location: string;
  size: string;
  openJobsCount: number | null;
  description: string;
  website: string;
  countryCode?: string;
};

export function getCompanyLogo(_slug?: string, _name?: string, customLogoUrl?: string | null): string {
  if (customLogoUrl && customLogoUrl.trim()) return companyImageUrl(customLogoUrl.trim());
  return "/logos/smartrecruitment.svg";
}

export function getCompanyCover(_slug?: string, _name?: string, customCoverUrl?: string | null): string {
  if (customCoverUrl && customCoverUrl.trim()) return companyImageUrl(customCoverUrl.trim());
  return "/companies/company-placeholder.svg";
}

function companyImageUrl(url: string): string {
  return url.startsWith("/api/v2/public/") ? `${import.meta.env.VITE_GATEWAY_URL ?? ""}${url}` : url;
}

export function getCompanyTag(_slug?: string, _name?: string): string {
  return "Doanh nghiệp tuyển dụng";
}

export function getCompanyLocation(_slug?: string, jobsForCompany: PublicJob[] = []): string {
  const locations = [...new Set(jobsForCompany.map((job) => job.province?.trim() || job.locationText?.trim()).filter(Boolean))];
  return locations.length ? locations.join(" · ") : "Chưa có thông tin địa điểm";
}

export function formatCompanySize(rawSize?: string): string {
  return rawSize ? `${rawSize.replace(/ nhân sự$/, "")} nhân sự` : "Chưa công bố quy mô";
}

// In-memory reactive cache updated whenever fresh DB data arrives
let loadedCompaniesCache: CompanyInfo[] = [];

export function setLoadedCompaniesCache(companies: CompanyInfo[]) {
  loadedCompaniesCache = companies;
}

export function getLoadedCompaniesCache(): CompanyInfo[] {
  return loadedCompaniesCache;
}

/**
 * Transforms a raw database CompanyResponse into rich CompanyInfo
 */
export function mapCompanyRecord(c: PublicCompany, allJobs: PublicJob[] = []): CompanyInfo {
  const jobsForComp = allJobs.filter(
    (j) => j.companyId && j.companyId.toLowerCase() === c.companyId.toLowerCase()
  );
  const location = getCompanyLocation(c.slug, jobsForComp);

  return {
    id: c.companyId,
    name: c.legalName || c.displayName,
    shortName: c.displayName || c.legalName,
    tag: getCompanyTag(c.slug, c.displayName),
    logo: getCompanyLogo(c.slug, c.displayName, c.logoUrl),
    coverImage: getCompanyCover(c.slug, c.displayName, c.coverImageUrl),
    slug: c.slug,
    location,
    size: formatCompanySize(c.sizeRange),
    openJobsCount: jobsForComp.length,
    description: c.description || "Doanh nghiệp chưa bổ sung phần giới thiệu.",
    website: c.websiteUrl || "",
    countryCode: c.countryCode,
  };
}

/**
 * Dynamically resolves company metadata for a job by companyId or companyName
 */
export function resolveCompanyMeta(
  companyId?: string,
  companyName?: string,
  companiesList?: CompanyInfo[]
): CompanyInfo {
  const pool = companiesList && companiesList.length > 0 ? companiesList : loadedCompaniesCache;

  if (companyId && pool.length > 0) {
    const foundById = pool.find((c) => c.id.toLowerCase() === companyId.toLowerCase());
    if (foundById) return foundById;
  }

  if (companyName && pool.length > 0) {
    const norm = companyName.trim().toUpperCase();
    const foundByName = pool.find(
      (c) =>
        c.shortName.toUpperCase() === norm || c.name.toUpperCase() === norm
    );
    if (foundByName) return foundByName;
  }

  // Pure dynamic generation if company not yet cached
  const displayName = companyName || "Doanh nghiệp tuyển dụng";
  return {
    id: companyId || "comp-default",
    name: displayName,
    shortName: displayName,
    tag: getCompanyTag(undefined, displayName),
    logo: getCompanyLogo(undefined, displayName),
    coverImage: getCompanyCover(undefined, displayName),
    slug: "tech-company",
    location: "Chưa có thông tin địa điểm",
    size: "Chưa công bố quy mô",
    openJobsCount: null,
    description: "Doanh nghiệp tuyển dụng trên nền tảng Smart Recruitment.",
    website: "",
  };
}

/**
 * Backward compatibility export: dynamically backed by the loaded cache
 */
export const FEATURED_COMPANIES: CompanyInfo[] = new Proxy([] as CompanyInfo[], {
  get(_target, prop) {
    if (prop === "length") return loadedCompaniesCache.length;
    if (prop === "map") return loadedCompaniesCache.map.bind(loadedCompaniesCache);
    if (prop === "filter") return loadedCompaniesCache.filter.bind(loadedCompaniesCache);
    if (prop === "find") return loadedCompaniesCache.find.bind(loadedCompaniesCache);
    if (prop === "forEach") return loadedCompaniesCache.forEach.bind(loadedCompaniesCache);
    if (prop === "slice") return loadedCompaniesCache.slice.bind(loadedCompaniesCache);
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return loadedCompaniesCache[Number(prop)];
    }
    return (loadedCompaniesCache as any)[prop];
  },
});
