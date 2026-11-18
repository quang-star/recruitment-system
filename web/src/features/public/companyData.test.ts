import { expect, it, vi } from "vitest";
import { getCompanyCover, getCompanyLogo, mapCompanyRecord, resolveCompanyMeta, setLoadedCompaniesCache } from "./companyData";

it.each([
  ["fpt-software", "FPT SOFTWARE", "fpt.png", "fpt"],
  ["momo-fintech", "MOMO FINTECH", "momo.svg", "momo"],
  ["shopee-vietnam", "SHOPEE VIETNAM", "shopee.svg", "shopee"],
  ["techcombank-software", "TECHCOMBANK", "techcombank.svg", "techcombank"],
  ["vnpt-net", "TỔNG CÔNG TY HẠ TẦNG MẠNG (VNPT-NET)", "vnpt.png", "vnpt"],
  ["viettel-solutions", "VIETTEL SOLUTIONS", "viettel.png", "viettel"],
  ["vng-corporation", "VNG CORPORATION", "vng.png", "vng"],
  ["vpbank-digital", "VPBANK DIGITAL", "vpbank.svg", "vpbank"],
])("does not infer company media from the brand name %s", (slug, name) => {
  expect(getCompanyLogo(slug, name)).toBe("/logos/smartrecruitment.svg");
  expect(getCompanyCover(slug, name)).toBe("/companies/company-placeholder.svg");
  expect(getCompanyLogo(slug, name, "/saved-logo.png")).toBe("/saved-logo.png");
  expect(getCompanyCover(slug, name, "/saved-cover.webp")).toBe("/saved-cover.webp");
});

it("resolves uploaded company images through the configured gateway", () => {
  vi.stubEnv("VITE_GATEWAY_URL", "https://gateway.example");
  try {
    const path = "/api/v2/public/companies/123/images/logo/abc";
    expect(getCompanyLogo(undefined, undefined, path)).toBe(`https://gateway.example${path}`);
    expect(getCompanyCover(undefined, undefined, path)).toBe(`https://gateway.example${path}`);
    expect(getCompanyLogo(undefined, undefined, "/logos/example.svg")).toBe("/logos/example.svg");
  } finally {
    vi.unstubAllEnvs();
  }
});

it("does not invent size, city, website, office image or a VIP affiliation", () => {
  const company = mapCompanyRecord({ companyId: "c", legalName: "FPT partner example", displayName: "Example", slug: "example",
    description: "", websiteUrl: "", countryCode: "VN", status: "ACTIVE", verificationStatus: "PENDING", version: 0 });
  expect(company.size).toBe("Chưa công bố quy mô");
  expect(company.location).toBe("Chưa có thông tin địa điểm");
  expect(company.website).toBe("");
  expect(company.coverImage).toBe("/companies/company-placeholder.svg");
  expect(company.logo).toBe("/logos/smartrecruitment.svg");
});

it("uses exact company identities and never infers a job count for an unknown company", () => {
  const company = mapCompanyRecord({ companyId: "c", legalName: "Example", displayName: "Example", slug: "example", description: "", websiteUrl: "",
    countryCode: "VN", status: "ACTIVE", verificationStatus: "PENDING", version: 0 });
  setLoadedCompaniesCache([company]);
  expect(resolveCompanyMeta("other", "Example subsidiary").id).toBe("other");
  expect(resolveCompanyMeta("other", "Example subsidiary").openJobsCount).toBeNull();
  setLoadedCompaniesCache([]);
});
