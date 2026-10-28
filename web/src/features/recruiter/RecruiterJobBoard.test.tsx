import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { RecruiterJobBoard } from "./RecruiterJobBoard";
import { apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn(),
}));
const session = { accessToken: "test", roles: ["RECRUITER"] } as AuthSession;

it("reviews the saved JD beside editable requirements and requires saving before confirmation", async () => {
  const job = { jobId: "job", jobVersionId: "version", jobVersionNumber: 1, companyId: "company", title: "Backend role",
    description: "Original source description", requirementsText: "Original Java requirement", status: "DRAFT", version: 0,
    openings: 1, salaryNegotiable: true, externalAiConsent: false, matchingSupported: true,
    category: { industryId: "1", industryName: "IT" } };
  let parsed = { revisionId: "rev-1", jobVersionId: "version", revisionNumber: 1, status: "PARSED", payload: {
    title: { canonicalFamily: "BACKEND", level: "MID" }, overallConfidence: .8, qualityFlags: [],
    requirements: { requiredSkills: [{ raw: "Java", normalizationStatus: "KNOWN" }], preferredSkills: [], minimumRelevantExperienceMonths: 12 },
  } };
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (path === "/api/v2/parsed-jds/version" && options?.method === "PATCH") {
      parsed = { ...parsed, revisionId: "rev-2", payload: JSON.parse(options.body as string).payload }; return parsed;
    }
    if (path === "/api/v2/parsed-jds/version/confirm") return { ...parsed, status: "CONFIRMED" };
    if (path === "/api/v2/parsed-jds/version") return structuredClone(parsed);
    return { items: path.includes("/companies/") ? [job] : [], total: path.includes("/companies/") ? 1 : 0, page: 0, size: 12 };
  });
  render(<RecruiterJobBoard session={session} companyId="company" canRecruit />);
  fireEvent.click(await screen.findByRole("button", { name: /Backend role/ }));
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra yêu cầu" }));
  expect(screen.getByText("Original Java requirement")).toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText("Kỹ năng bắt buộc 1"), { target: { value: "TypeScript" } });
  expect(screen.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi yêu cầu" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v2/parsed-jds/version/confirm",
    expect.objectContaining({ body: JSON.stringify({ expectedRevisionId: "rev-2" }) })));
});

beforeEach(() => {
  vi.mocked(apiRequest).mockClear();
  vi.mocked(apiRequest).mockImplementation(async (_path, options) => {
    if (_path === "/api/v2/public/job-categories") return [];
    if (options?.method === "POST") return {
      ...JSON.parse(options.body as string), jobId: "job", jobVersionId: "version", jobVersionNumber: 1,
      companyId: "company", status: "DRAFT", version: 0, sourceHash: "a".repeat(64),
    };
    return { items: [], total: 0, page: 0, size: 12 };
  });
});

it("submits a new outside industry without waiting for catalog approval or ParsedJD", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (options?.method === "POST") return { ...JSON.parse(options.body as string), jobId: "job", jobVersionId: "version",
      jobVersionNumber: 1, companyId: "company", status: "DRAFT", version: 0, matchingSupported: false };
    return { items: [], total: 0, page: 0, size: 12 };
  });
  render(<RecruiterJobBoard session={session} companyId="company" canRecruit />);
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo JD mới" }));
  fireEvent.change(screen.getByLabelText("Ngành", { exact: true }), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Tên ngành mới"), { target: { value: "Kế toán" } });
  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Kế toán tổng hợp" } });
  fireEvent.change(screen.getByLabelText("Mô tả công việc"), { target: { value: "Lập báo cáo tài chính" } });
  fireEvent.change(screen.getByLabelText("Yêu cầu"), { target: { value: "Kinh nghiệm kế toán" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await screen.findByText("Đã lưu tin. Ngành này chưa hỗ trợ AI; có thể đăng tin và tuyển dụng thủ công.");
  const call = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(JSON.parse(call[1]!.body as string).category).toEqual({ industryId: null, industryName: "Kế toán",
    specializationId: null, specializationName: "Khác", positionId: null, positionName: "Kế toán tổng hợp" });
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.startsWith("/api/v2/parsed-jds"))).toBe(false);
});

it.each([false, true])("submits the explicit JD external AI choice (%s) with the displayed policy", async (consented) => {
  render(<RecruiterJobBoard session={session} companyId="company" canRecruit />);
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo JD mới" }));
  const checkbox = screen.getByRole("checkbox", { name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này" });
  expect(checkbox).not.toBeChecked();
  if (consented) fireEvent.click(checkbox);
  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Backend" } });
  fireEvent.change(screen.getByLabelText("Mô tả công việc"), { target: { value: "Build Java services" } });
  fireEvent.change(screen.getByLabelText("Yêu cầu"), { target: { value: "Java" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
  const call = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === "POST")!;
  const body = JSON.parse(call[1]!.body as string);
  expect(body.externalAiConsent).toBe(consented);
  expect(body.externalAiPolicyVersion).toBe(consented ? "external-ai/1.0" : null);
});

it("applies a career suggestion to the unsaved draft and persists it only through the normal save", async () => {
  const category = { industryId: null, industryName: "Kế toán", specializationId: null,
    specializationName: "Báo cáo tài chính", positionId: null, positionName: "Kế toán tổng hợp" };
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (path === "/api/v2/parsed-jds/category-suggestions") return {
      status: "SUGGESTED", reasonCode: null, inputHash: "a".repeat(64), catalogHash: "b".repeat(64),
      suggestions: [{ category, evidenceQuotes: ["Lập báo cáo tài chính"] }],
    };
    if (options?.method === "POST") return { ...JSON.parse(options.body as string), jobId: "job", jobVersionId: "version",
      jobVersionNumber: 1, companyId: "company", status: "DRAFT", version: 0, matchingSupported: false };
    return { items: [], total: 0, page: 0, size: 12 };
  });
  render(<RecruiterJobBoard session={session} companyId="company" canRecruit />);
  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Kế toán tổng hợp" } });
  fireEvent.change(screen.getByLabelText("Mô tả công việc"), { target: { value: "Lập báo cáo tài chính" } });
  fireEvent.change(screen.getByLabelText("Yêu cầu"), { target: { value: "Kinh nghiệm kế toán" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này" }));
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  await screen.findByRole("button", { name: "Áp dụng gợi ý 1" });
  expect(screen.getByLabelText("Ngành", { exact: true })).toHaveValue("1");
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng gợi ý 1" }));
  expect(screen.getByLabelText("Tên ngành mới")).toHaveValue("Kế toán");
  expect(screen.getByLabelText("Tên vị trí mới")).toHaveValue("Kế toán tổng hợp");
  expect(screen.getByRole("checkbox", { name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này" })).toBeChecked();
  expect(vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => /\/dashboard\/catalog/.test(path))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await screen.findByText("Đã lưu tin. Ngành này chưa hỗ trợ AI; có thể đăng tin và tuyển dụng thủ công.");
  const saved = vi.mocked(apiRequest).mock.calls.find(([path, options]) => path === "/api/v2/companies/company/jobs" && options?.method === "POST")!;
  expect(JSON.parse(saved[1]!.body as string).category).toEqual(category);
});

it("renders job specific analytics tab with KPI metrics and conversion funnel", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.includes("/applications")) {
      return {
        items: [
          { applicationId: "app-1", status: "SUBMITTED", appliedAt: "2026-10-01T00:00:00Z" },
          { applicationId: "app-2", status: "UNDER_REVIEW", appliedAt: "2026-10-02T00:00:00Z" },
          { applicationId: "app-3", status: "SHORTLISTED", appliedAt: "2026-10-03T00:00:00Z" },
        ],
        total: 3,
        page: 0,
        size: 100
      };
    }
    return {
      items: [{
        jobId: "job-analytics-test",
        title: "DevOps Engineer",
        description: "CI/CD Kubernetes",
        requirementsText: "Docker Linux",
        openings: 2,
        status: "PUBLISHED",
        version: 0,
        jobVersionNumber: 1
      }],
      total: 1,
      page: 0,
      size: 12
    };
  });

  render(<RecruiterJobBoard session={session} companyId="company" canRecruit initialJobId="job-analytics-test" />);

  // Select "Thống kê tin này" tab
  const analyticsTabBtn = await screen.findByRole("button", { name: "📊 Thống kê tin này" });
  fireEvent.click(analyticsTabBtn);

  // Verify KPI cards and Funnel
  expect(await screen.findByText("Báo cáo thống kê: DevOps Engineer")).toBeInTheDocument();
  expect(screen.getByText("Tổng hồ sơ nộp")).toBeInTheDocument();
  expect(screen.getByText("Chờ xử lý")).toBeInTheDocument();
  expect(screen.getByText("Vào Shortlist")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xem Kanban Pipeline →" })).toBeInTheDocument();
});
