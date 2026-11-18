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
const callbacks = () => ({ onApply: vi.fn(), onSelectJob: vi.fn(), onViewCompany: vi.fn(),
  onRequireLogin: vi.fn(), onOpenCvLibrary: vi.fn() });

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ items: [job, other], total: 2, page: 0, size: 6 });
});

it("loads other jobs for this company, excludes the current job and navigates through the result", async () => {
  const actions = callbacks();
  render(<JobDetailPage job={job} company={company} {...actions} />);
  expect(await screen.findByRole("link", { name: /Platform Engineer/ })).toBeInTheDocument();
  const related = screen.getByRole("region", { name: "Việc làm khác tại công ty" });
  expect(within(related).queryByRole("link", { name: /Java Engineer/ })).not.toBeInTheDocument();
  expect(within(related).queryByText("Xem chi tiết")).not.toBeInTheDocument();
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

it("renders rich-text JD HTML cleanly without raw tags or unsafe scripts", async () => {
  const htmlJob: PublicJob = {
    ...job,
    description: "<p><strong>Xây dựng API</strong></p><ul><li>Phát triển dịch vụ</li></ul><script>window.__xss=1</script>",
    requirementsText: "<ul><li>Java</li><li>Docker</li></ul>",
    benefitsText: "<p>Thưởng tháng 13</p>"
  };
  render(<JobDetailPage job={htmlJob} company={company} {...callbacks()} />);
  expect(screen.getByText("Xây dựng API")).toBeInTheDocument();
  expect(screen.getByText("Phát triển dịch vụ")).toBeInTheDocument();
  expect(screen.getByText("Thưởng tháng 13")).toBeInTheDocument();
  expect(screen.queryByText(/<p>|<ul>|<script>/)).not.toBeInTheDocument();
  await screen.findByRole("link", { name: /Platform Engineer/ });
});

it("shows already-applied status and opens the existing application for a signed-in candidate", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (String(path).startsWith("/api/v2/candidate/applications?")) {
      return { items: [{ applicationId: "app-77", status: "SHORTLISTED" }], total: 1, page: 0, size: 1 };
    }
    if (String(path).startsWith("/api/v2/cvs")) return [];
    return { items: [job, other], total: 2, page: 0, size: 6 };
  });
  const onViewApplication = vi.fn();
  const session = {
    userId: "cand-1",
    accessToken: "token",
    refreshToken: "refresh",
    accessTokenExpiresAt: "2030-01-01T00:00:00Z",
    refreshTokenExpiresAt: "2030-01-02T00:00:00Z",
    roles: ["CANDIDATE"]
  };
  render(<JobDetailPage job={job} company={company} session={session} {...callbacks()} onViewApplication={onViewApplication} />);
  expect(await screen.findByText(/Đã ứng tuyển · Danh sách rút gọn/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ứng tuyển vị trí này" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem đơn ứng tuyển" }));
  expect(onViewApplication).toHaveBeenCalledWith("app-77");
});

it("toggles and persists saved job bookmarks from the detail CTA row", async () => {
  const { unmount } = render(<JobDetailPage job={job} company={company} {...callbacks()} />);
  const saveButton = screen.getByRole("button", { name: "Lưu công việc" });
  expect(saveButton).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(saveButton);
  expect(screen.getByRole("button", { name: "Đã lưu tin" })).toHaveAttribute("aria-pressed", "true");
  await screen.findByRole("link", { name: /Platform Engineer/ });
  unmount();

  render(<JobDetailPage job={job} company={company} {...callbacks()} />);
  expect(screen.getByRole("button", { name: "Đã lưu tin" })).toHaveAttribute("aria-pressed", "true");
  await screen.findByRole("link", { name: /Platform Engineer/ });
});

it("renders salary period, remaining deadline days, and structured company sidebar metadata", async () => {
  const futureDeadline = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const richJob: PublicJob = {
    ...job,
    salaryPeriod: "MONTH",
    applicationDeadline: futureDeadline,
    category: { industryName: "Công nghệ thông tin" }
  };

  render(<JobDetailPage job={richJob} company={company} {...callbacks()} />);
  expect(screen.getByText("20 triệu – 30 triệu / tháng")).toBeInTheDocument();
  expect(screen.getByText(/Còn \d+ ngày/)).toBeInTheDocument();

  const aside = screen.getByRole("complementary", { name: "Thông tin công ty và việc làm liên quan" });
  expect(within(aside).getByText("Công nghệ thông tin")).toBeInTheDocument();
  expect(within(aside).getByText("100-499 nhân sự")).toBeInTheDocument();
  expect(within(aside).getByText("Việt Nam")).toBeInTheDocument();
  expect(await within(aside).findByText("2 việc làm đang tuyển")).toBeInTheDocument();
});
