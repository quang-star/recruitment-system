import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { CompanyProfilePage } from "./CompanyProfilePage";
import { mapCompanyRecord } from "./companyData";
import { PublicJob } from "./types";

vi.mock("../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const company = mapCompanyRecord({ companyId: "10", legalName: "Example Ltd", displayName: "Example", slug: "example",
  description: "Giới thiệu do doanh nghiệp cung cấp.", websiteUrl: "https://example.com", countryCode: "VN", sizeRange: "100-499",
  logoUrl: "/company-logo.webp", coverImageUrl: "/company-cover.webp", status: "ACTIVE", verificationStatus: "UNVERIFIED", version: 0 });
const job: PublicJob = { jobId: "42", companyId: "10", companyName: "Example", title: "Java Engineer", description: "API",
  requirementsText: "Java", benefitsText: null, locationText: "Hà Nội", workMode: "HYBRID", employmentType: "FULL_TIME",
  seniorityLevel: "Junior", openings: 1, salaryMin: null, salaryMax: null, salaryCurrency: "VND", salaryNegotiable: true,
  category: { industryName: "Công nghệ thông tin" } };

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ items: [job], total: 13, page: 0, size: 12 });
  Element.prototype.scrollIntoView = vi.fn();
});

it("shows supplied company information before paginated open jobs and opens a full detail link", async () => {
  const onSelectJob = vi.fn();
  render(<CompanyProfilePage company={company} onSelectJob={onSelectJob} />);
  expect(screen.getByText(company.description)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Website công ty" })).toHaveAttribute("href", "https://example.com/");
  expect(screen.getByRole("img", { name: "Example logo" })).toHaveAttribute("src", "/company-logo.webp");
  const link = await screen.findByRole("link", { name: /Java Engineer.*Xem chi tiết/ });
  expect(link).toHaveAttribute("href", expect.stringContaining("job=42"));
  fireEvent.click(link);
  expect(onSelectJob).toHaveBeenCalledWith(job);
  expect(screen.queryByRole("button", { name: /Ứng tuyển/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
  await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path]) =>
    path.includes("companyId=10") && path.includes("page=1"))).toBe(true));
});

it("retries a failed company job request and distinguishes an empty list", async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Unavailable"));
  vi.mocked(apiRequest).mockResolvedValue({ items: [], total: 0, page: 0, size: 12 });
  render(<CompanyProfilePage company={company} onSelectJob={vi.fn()} />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Chưa có vị trí đang tuyển")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByText("Chưa có vị trí đang tuyển")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("does not turn an unsafe company website into a clickable link", async () => {
  render(<CompanyProfilePage company={{ ...company, website: "javascript:alert(1)" }} onSelectJob={vi.fn()} />);
  expect(screen.queryByRole("link", { name: "Website công ty" })).not.toBeInTheDocument();
  await screen.findByRole("link", { name: /Java Engineer/ });
});
