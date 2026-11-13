import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { JobDetailPage } from "./JobDetailPage";
import { PublicJob } from "./types";
import { mapCompanyRecord } from "./companyData";

vi.mock("../../shared/api/client", () => ({ apiRequest: vi.fn() }));

const job: PublicJob = { jobId: "10", companyId: "2", jobVersionId: "20", title: "Java Engineer", description: "Xây dựng API",
  requirementsText: "Java và SQL", benefitsText: "Đào tạo chuyên môn", locationText: "Hà Nội", workMode: "HYBRID",
  employmentType: "FULL_TIME", seniorityLevel: "SENIOR", openings: 2, salaryMin: 20000000, salaryMax: 30000000,
  salaryCurrency: "VND", salaryNegotiable: false, matchingSupported: true };
const other = { ...job, jobId: "11", title: "Platform Engineer" };
const company = mapCompanyRecord({ companyId: "2", legalName: "Example", displayName: "Example", slug: "example",
  description: "Công ty phần mềm", websiteUrl: "", countryCode: "VN", sizeRange: "100-499",
  logoUrl: "/saved-logo.png", coverImageUrl: "/saved-cover.webp", status: "ACTIVE", verificationStatus: "UNVERIFIED", version: 0 });
const callbacks = () => ({ onBack: vi.fn(), onApply: vi.fn(), onSelectJob: vi.fn(), onViewCompany: vi.fn(),
  onRequireLogin: vi.fn(), onOpenCvLibrary: vi.fn() });

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ items: [job, other], total: 2, page: 0, size: 6 });
});

it("loads other jobs for this company, excludes the current job and navigates through the result", async () => {
  const actions = callbacks();
  render(<JobDetailPage job={job} company={company} {...actions} />);
  expect(await screen.findByRole("link", { name: /Platform Engineer/ })).toBeInTheDocument();
  const related = screen.getByRole("region", { name: "Việc làm khác tại công ty" });
  expect(within(related).queryByRole("link", { name: /Java Engineer/ })).not.toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls[0][0]).toContain("companyId=2");
  fireEvent.click(screen.getByRole("link", { name: /Platform Engineer/ }));
  expect(actions.onSelectJob).toHaveBeenCalledWith(other);
  fireEvent.click(screen.getByRole("button", { name: "Xem hồ sơ công ty" }));
  expect(actions.onViewCompany).toHaveBeenCalledWith("2");
});

it("keeps matching inline and uses the existing apply and login actions", async () => {
  const actions = callbacks();
  render(<JobDetailPage job={job} company={company} {...actions} />);
  expect(screen.getByRole("heading", { name: job.title, level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Đánh giá độ phù hợp với CV trước khi nộp" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ứng tuyển vị trí này" }));
  expect(actions.onApply).toHaveBeenCalledWith(job);
  fireEvent.click(screen.getByRole("button", { name: /Đăng nhập để kiểm tra/ }));
  expect(actions.onRequireLogin).toHaveBeenCalledOnce();
  await screen.findByRole("link", { name: /Platform Engineer/ });
});

it("shows a retry instead of invented related jobs when the API fails", async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Unavailable"));
  render(<JobDetailPage job={job} company={company} {...callbacks()} />);
  const alert = await screen.findByRole("alert");
  expect(screen.queryByRole("link", { name: /Platform Engineer/ })).not.toBeInTheDocument();
  fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
  await waitFor(() => expect(screen.getByRole("link", { name: /Platform Engineer/ })).toBeInTheDocument());
});
