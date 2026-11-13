import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicHomePage } from "./PublicHomePage";
import { apiRequest } from "../../shared/api/client";
import { getPendingJobId } from "../../shared/pendingApplication";
import { PublicJob } from "./types";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn()
}));
vi.mock("../auth/LoginPage", () => ({ LoginPage: ({ initialEmail = "" }: { initialEmail?: string }) =>
  <div>Biểu mẫu đăng nhập <span data-testid="login-email">{initialEmail}</span></div> }));

const jobs: PublicJob[] = [
  { jobId: "java", companyId: "company-a", companyName: "Alpha", title: "Java Developer", description: "Phát triển ứng dụng", requirementsText: "Java", benefitsText: null, locationText: "Hà Nội", workMode: "HYBRID", employmentType: "FULL_TIME", seniorityLevel: "Junior", openings: 1, salaryMin: 20000000, salaryMax: 30000000, salaryCurrency: "VND", salaryNegotiable: false },
  { jobId: "react", companyId: "company-b", companyName: "Beta", title: "React Engineer", description: "Giao diện web", requirementsText: "React", benefitsText: null, locationText: "Đà Nẵng", workMode: "REMOTE", employmentType: "FULL_TIME", seniorityLevel: "Senior", openings: 1, salaryMin: null, salaryMax: null, salaryCurrency: "VND", salaryNegotiable: true }
];

it("opens login on an invitation URL and preserves its token", async () => {
  window.history.replaceState(null, "", "/accept-invitation?token=synthetic-invitation");
  render(<PublicHomePage onLoginSuccess={vi.fn()} />);
  expect(await screen.findByText("Biểu mẫu đăng nhập")).toBeVisible();
  expect(window.location.pathname).toBe("/accept-invitation");
  expect(new URLSearchParams(window.location.search).get("token")).toBe("synthetic-invitation");
});

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/api/v2/public/jobs/discovery") return {
      locations: ["Hà Nội", "Đà Nẵng", "Cần Thơ"],
      categories: [{ industryId: "1", specializationId: "42", name: "Phát triển web", jobCount: 2 }]
    };
    if (path === "/api/v2/public/jobs?summary") return { "company-a": 1, "company-b": 1 };
    if (path.startsWith("/api/v2/public/jobs?")) {
      const params = new URL(path, "http://test").searchParams;
      const items = jobs.filter((job) => (!params.get("q") || job.title.toLowerCase().includes(params.get("q")!.toLowerCase()))
        && (!params.get("jobId") || job.jobId === params.get("jobId"))
        && (!params.get("companyId") || job.companyId === params.get("companyId"))
        && (!params.get("workMode") || job.workMode === params.get("workMode"))
        && (!params.get("employmentType") || job.employmentType === params.get("employmentType"))
        && (!params.get("minSalary") || (job.salaryNegotiable || (job.salaryMax != null && job.salaryMax >= Number(params.get("minSalary")))))
        && (!params.get("maxSalary") || (job.salaryNegotiable || (job.salaryMin != null && job.salaryMin <= Number(params.get("maxSalary")))))
        && (!params.get("seniority") || params.get("seniority")!.split("|").includes(job.seniorityLevel!)));
      return { items, total: items.length, page: 0, size: 12 };
    }
    if (path === "/api/v2/public/companies") return [
      { companyId: "company-a", legalName: "Alpha", displayName: "Alpha", slug: "alpha", description: "Phần mềm", websiteUrl: "", countryCode: "VN" },
      { companyId: "company-b", legalName: "Beta", displayName: "Beta", slug: "beta", description: "Phần mềm", websiteUrl: "", countryCode: "VN" }
    ];
    return [];
  });
});

async function openPortal() {
  render(<PublicHomePage onLoginSuccess={vi.fn()} />);
  await screen.findByText("2 vị trí đang tuyển");
}

describe("Public job discovery", () => {
  it("uses API locations and category identities instead of fixed marketing categories", async () => {
    await openPortal();
    expect(within(screen.getByLabelText("Địa điểm làm việc")).getByRole("option", { name: "Cần Thơ" })).toBeInTheDocument();
    expect(screen.queryByText("Cloud & DevOps")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Phát triển web.*2 việc làm/ }));
    await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path]) =>
      path.includes("industryId=1") && path.includes("specializationId=42"))).toBe(true));
    expect(screen.getByRole("button", { name: "Xóa bộ lọc nhóm nghề" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc nhóm nghề" }));
    expect(new URLSearchParams(window.location.search).has("specialization")).toBe(false);
  });

  it("keeps search available without inventing discovery options when the API fails", async () => {
    const original = vi.mocked(apiRequest).getMockImplementation()!;
    vi.mocked(apiRequest).mockImplementation((path, options) => path === "/api/v2/public/jobs/discovery"
      ? Promise.reject(new Error("Unavailable")) : original(path, options));
    await openPortal();
    expect(await screen.findByText("Chưa tải được địa điểm và nhóm nghề đang tuyển.")).toBeInTheDocument();
    expect(screen.getByLabelText("Địa điểm làm việc").children).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Khám phá theo chuyên môn" })).not.toBeInTheDocument();
  });
  it("restores the exact selected job from a shared search URL", async () => {
    window.history.replaceState(null, "", "/?view=search&job=react");
    render(<PublicHomePage onLoginSuccess={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "React Engineer", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Java Developer", level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("selects a demo email without sending credentials or losing the chosen job", async () => {
    await openPortal();
    fireEvent.click(screen.getAllByRole("button", { name: /Java Developer.*Ứng tuyển/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Ứng tuyển vị trí này" }));
    fireEvent.click(screen.getByRole("button", { name: /Chọn tài khoản ứng viên/ }));
    expect(screen.getByTestId("login-email")).toHaveTextContent("candidate.demo@smart.local");
    expect(getPendingJobId()).toBe("java");
    expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("carries the home search into a full detail page and preserves the application intent", async () => {
    await openPortal();
    const input = screen.getByRole("textbox", { name: "Vị trí hoặc kỹ năng" });
    fireEvent.change(input, { target: { value: "React" } });
    fireEvent.submit(screen.getByRole("form", { name: "Tìm cơ hội nghề nghiệp" }));
    expect(screen.getByRole("textbox", { name: "Tìm kiếm việc làm" })).toHaveValue("React");
    expect(screen.queryByRole("heading", { name: "Java Developer" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("link", { name: /React Engineer.*Xem chi tiết/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "React Engineer", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ứng tuyển vị trí này" }));
    expect(getPendingJobId()).toBe("react");
    expect(screen.getByText("Bạn đang ứng tuyển: React Engineer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy lựa chọn" }));
    expect(getPendingJobId()).toBeNull();
  });

  it("opens a company introduction with its open jobs and returns from a job to the company", async () => {
    await openPortal();
    fireEvent.click(screen.getByRole("button", { name: "Xem việc làm tại Alpha" }));
    expect(await screen.findByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Giới thiệu công ty" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Java Developer.*Xem chi tiết/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "React Engineer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Java Developer.*Xem chi tiết/ }));
    expect(await screen.findByRole("heading", { name: "Java Developer", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Quay lại danh sách" }));
    expect(await screen.findByRole("heading", { name: "Alpha", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Danh sách công ty" }));
    expect(await screen.findByRole("heading", { name: "Tìm hiểu nhà tuyển dụng" })).toBeInTheDocument();
  });

  it("does not display unrelated details for zero results and clears every filter", async () => {
    await openPortal();
    fireEvent.click(screen.getByRole("button", { name: "Tìm việc làm" }));
    fireEvent.change(screen.getByLabelText("Lọc theo cấp bậc"), { target: { value: "Fresher|Junior|Intern" } });
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Java Developer" })).toHaveLength(1));
    fireEvent.change(screen.getByRole("textbox", { name: "Tìm kiếm việc làm" }), { target: { value: "không tồn tại" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.queryByRole("complementary", { name: "Chi tiết việc làm đã chọn" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Đặt lại bộ lọc" }));
    expect(screen.getByLabelText("Lọc theo cấp bậc")).toHaveValue("");
    expect(await screen.findByRole("heading", { name: "React Engineer" })).toBeInTheDocument();
  });

  it("keeps the job detail page behind the existing sign-in step", async () => {
    await openPortal();
    fireEvent.click(screen.getAllByRole("button", { name: /Java Developer.*Ứng tuyển/ })[0]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ứng tuyển vị trí này" }));
    expect(screen.queryByRole("dialog", { name: "Java Developer" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Bước tiếp theo cho sự nghiệp của bạn" })).toBeInTheDocument();
    expect(getPendingJobId()).toBe("java");
    expect(screen.getByRole("heading", { name: "Java Developer", level: 1 })).toBeInTheDocument();
  });
  it("returns from the full page to the same search filters", async () => {
    window.history.replaceState(null, "", "/?view=search&q=React&mode=REMOTE&job=react");
    render(<PublicHomePage onLoginSuccess={vi.fn()} />);
    await screen.findByRole("heading", { name: "React Engineer", level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "← Quay lại danh sách" }));
    expect(screen.getByRole("textbox", { name: "Tìm kiếm việc làm" })).toHaveValue("React");
    expect(screen.getByLabelText("Lọc theo chế độ làm việc")).toHaveValue("REMOTE");
    expect(new URLSearchParams(window.location.search).get("job")).toBeNull();
    await waitFor(() => expect(screen.getByRole("link", { name: /React Engineer.*Xem chi tiết/ })).toHaveFocus());
  });
  it("handles an unavailable shared job without opening an unrelated job", async () => {
    window.history.replaceState(null, "", "/?job=missing");
    render(<PublicHomePage onLoginSuccess={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Không mở được vị trí này", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ứng tuyển vị trí này" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("filters jobs by salary range and displays active filter chips with removal", async () => {
    await openPortal();
    fireEvent.click(screen.getByRole("button", { name: "Tìm việc làm" }));
    fireEvent.change(screen.getByLabelText("Lọc theo mức lương"), { target: { value: "15_30" } });
    await waitFor(() => {
      expect(screen.getAllByText(/15 – 30 triệu/).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByLabelText("Bộ lọc đang áp dụng")).toBeInTheDocument();
    const removeSalaryBtn = screen.getByRole("button", { name: "Xóa bộ lọc mức lương" });
    fireEvent.click(removeSalaryBtn);
    expect(screen.queryByRole("button", { name: "Xóa bộ lọc mức lương" })).not.toBeInTheDocument();
  });

  it("filters jobs by work mode", async () => {
    await openPortal();
    fireEvent.click(screen.getByRole("button", { name: "Tìm việc làm" }));
    fireEvent.change(screen.getByLabelText("Lọc theo chế độ làm việc"), { target: { value: "REMOTE" } });
    await waitFor(() => {
      expect(screen.getAllByText("Từ xa").length).toBeGreaterThan(0);
    });
  });

  it("restores a shared company URL and clears company scope when navigating to search", async () => {
    window.history.replaceState(null, "", "/?view=companies&company=company-b");
    render(<PublicHomePage onLoginSuccess={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Beta", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /React Engineer.*Xem chi tiết/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Java Developer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tìm việc làm" }));
    expect(await screen.findByRole("heading", { name: "Java Developer" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).has("company")).toBe(false);
  });

  it("opens legacy company-search URLs as a company profile", async () => {
    window.history.replaceState(null, "", "/?view=search&company=company-b");
    render(<PublicHomePage onLoginSuccess={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Beta", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Danh sách công ty" }));
    fireEvent.click(screen.getByRole("button", { name: "Tìm việc làm" }));
    expect(await screen.findByRole("heading", { name: "React Engineer" })).toBeInTheDocument();
  });

  it("does not substitute another company when a shared profile is unavailable", async () => {
    window.history.replaceState(null, "", "/?view=companies&company=missing");
    render(<PublicHomePage onLoginSuccess={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Chưa mở được hồ sơ công ty", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Java Developer" })).not.toBeInTheDocument();
  });
});
