import { expect, it } from "vitest";
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
])("resolves downloaded media consistently for %s", (slug, name, logo, cover) => {
  expect(getCompanyLogo(slug)).toBe(`/logos/official/${logo}`);
  expect(getCompanyLogo(undefined, ` ${name.toLowerCase()} `)).toBe(`/logos/official/${logo}`);
  expect(getCompanyCover(slug)).toBe(`/companies/photos/${cover}.webp`);
  expect(getCompanyCover(undefined, name)).toBe(getCompanyCover(slug));
});

it("does not invent size, city, website, office image or a VIP affiliation", () => {
  const company = mapCompanyRecord({ companyId: "c", legalName: "FPT partner example", displayName: "Example", slug: "example",
    description: "", websiteUrl: "", countryCode: "VN", status: "ACTIVE", verificationStatus: "PENDING", version: 0 });
  expect(company.size).toBe("Chưa công bố quy mô");
  expect(company.location).toBe("Chưa có thông tin địa điểm");
  expect(company.website).toBe("");
  expect(company.coverImage).toBe("/companies/photos/workplace.webp");
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
