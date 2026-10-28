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

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  vi.mocked(apiRequest).mockImplementation(async (path) => {
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
  it("restores the exact selected job from a shared search URL", async () => {
    window.history.replaceState(null, "", "/?view=search&job=react");
    render(<PublicHomePage onLoginSuccess={vi.fn()} />);
    const detail = await screen.findByRole("complementary", { name: "Chi tiết việc làm đã chọn" });
    await within(detail).findByRole("heading", { name: "React Engineer" });
    expect(within(detail).queryByRole("heading", { name: "Java Developer" })).not.toBeInTheDocument();
  });
  it("selects a demo email without sending credentials or losing the chosen job", async () => {
    await openPortal();
    fireEvent.click(screen.getAllByRole("button", { name: /Java Developer.*Ứng tuyển/ })[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ứng tuyển vị trí này" }));
    fireEvent.click(screen.getByRole("button", { name: /Chọn tài khoản ứng viên/ }));
    expect(screen.getByTestId("login-email")).toHaveTextContent("candidate.demo@smart.local");
    expect(getPendingJobId()).toBe("java");
    expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });
  it("carries the home search into results, updates inline details and preserves the application intent", async () => {
    await openPortal();
    const input = screen.getByRole("textbox", { name: "Vị trí hoặc kỹ năng" });
    fireEvent.change(input, { target: { value: "React" } });
    fireEvent.submit(screen.getByRole("form", { name: "Tìm cơ hội nghề nghiệp" }));
    expect(screen.getByRole("textbox", { name: "Tìm kiếm việc làm" })).toHaveValue("React");
    expect(screen.queryByRole("heading", { name: "Java Developer" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /React Engineer.*Bấm xem chi tiết/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const detail = screen.getByRole("complementary", { name: "Chi tiết việc làm đã chọn" });
    fireEvent.click(within(detail).getByRole("button", { name: "Ứng tuyển ngay" }));
    expect(getPendingJobId()).toBe("react");
    expect(screen.getByText("Bạn đang ứng tuyển: React Engineer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hủy lựa chọn" }));
    expect(getPendingJobId()).toBeNull();
  });

  it("filters jobs by the selected company ID", async () => {
    await openPortal();
    fireEvent.click(screen.getByRole("button", { name: "Xem việc làm tại Alpha" }));
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Java Developer" })).toHaveLength(2));
    expect(screen.queryByRole("heading", { name: "React Engineer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ lọc công ty ×" }));
    expect(await screen.findByRole("heading", { name: "React Engineer" })).toBeInTheDocument();
  });

  it("does not display unrelated details for zero results and clears every filter", async () => {
    await openPortal();
    fireEvent.click(screen.getByRole("button", { name: "Tìm việc làm" }));
    fireEvent.change(screen.getByLabelText("Cấp bậc:"), { target: { value: "Fresher|Junior|Intern" } });
    await waitFor(() => expect(screen.getAllByRole("heading", { name: "Java Developer" })).toHaveLength(2));
    fireEvent.change(screen.getByRole("textbox", { name: "Tìm kiếm việc làm" }), { target: { value: "không tồn tại" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Đặt lại bộ lọc" }));
    expect(screen.getByLabelText("Cấp bậc:")).toHaveValue("");
    expect(await screen.findByRole("heading", { name: "React Engineer" })).toBeInTheDocument();
  });

  it("closes the home job drawer before showing the sign-in step", async () => {
    await openPortal();
    fireEvent.click(screen.getAllByRole("button", { name: /Java Developer.*Ứng tuyển/ })[0]);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Ứng tuyển vị trí này" }));
    expect(screen.queryByRole("dialog", { name: "Java Developer" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Bước tiếp theo cho sự nghiệp của bạn" })).toBeInTheDocument();
    expect(getPendingJobId()).toBe("java");
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
      expect(screen.getByText("Từ xa")).toBeInTheDocument();
    });
  });
});
