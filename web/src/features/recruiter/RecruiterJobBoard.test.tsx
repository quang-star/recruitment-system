import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RecruiterJobBoard } from "./RecruiterJobBoard";
import { apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}
if (typeof Range !== "undefined") {
  const emptyRect = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => emptyRect;
  }
}

async function setRichText(label: string, text: string) {
  const editor = screen.getByLabelText(label);
  const user = userEvent.setup();
  await user.click(editor);
  await user.paste(text);
}

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn(),
}));
const session = { accessToken: "test", roles: ["RECRUITER"] } as AuthSession;

it("keeps draft work available but disables publication for a pending company", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path === "/api/v2/public/job-categories" ? [] : {
    items: [{ jobId: "42", jobVersionId: "99", title: "Pending company draft", status: "DRAFT", version: 0,
      openings: 1, category: { industryName: "IT" } }], total: 1, page: 0, size: 12
  });
  render(<RecruiterJobBoard session={session} companyId="company" companyStatus="PENDING" canRecruit />);
  expect(screen.getByText(/Công ty đang chờ Admin duyệt/)).toBeVisible();
  const publish = await screen.findByRole("button", { name: "Đăng tin" });
  expect(publish).toBeDisabled();
  fireEvent.click(publish);
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.includes("/publish?"))).toBe(false);
  expect(screen.getByRole("button", { name: "+ Tạo JD mới" })).toBeEnabled();
});

it.each(["CONFIRMED", "PARSED"])("checks the clicked job's saved ParsedJD before publishing from the list: %s", async (parsedStatus) => {
  const job = { jobId: "42", jobVersionId: "99", jobVersionNumber: 1, companyId: "company", title: "List publish job",
    description: "Build services", requirementsText: "Java", status: "DRAFT", version: 2,
    openings: 1, salaryNegotiable: true, externalAiConsent: false, matchingSupported: true,
    category: { industryId: "1", industryName: "IT" } };
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (path === "/api/v2/parsed-jds/99") return { status: parsedStatus };
    if (path === "/api/v2/jobs/42/publish?version=2" && options?.method === "POST") return { ...job, status: "PUBLISHED", version: 3 };
    return { items: [job], total: 1, page: 0, size: 12 };
  });
  render(<RecruiterJobBoard session={session} companyId="company" companyStatus="ACTIVE" canRecruit />);
  fireEvent.click(await screen.findByRole("button", { name: "Đăng tin" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v2/parsed-jds/99", expect.anything()));
  if (parsedStatus === "CONFIRMED") {
    await waitFor(() => expect(screen.getAllByText("JD đã được đăng.").some((item) => item.closest(".fixed") === null)).toBe(true));
    expect(apiRequest).toHaveBeenCalledWith("/api/v2/jobs/42/publish?version=2", expect.objectContaining({ method: "POST" }));
  } else {
    await waitFor(() => expect(screen.getAllByText("Cần review và xác nhận ParsedJD trước khi đăng JD.").some((item) => item.closest(".fixed") === null)).toBe(true));
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.includes("/publish?"))).toBe(false);
  }
});

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
  window.history.replaceState(null, "", "/");
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
  await setRichText("Mô tả công việc", "Lập báo cáo tài chính");
  await setRichText("Yêu cầu", "Kinh nghiệm kế toán");
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await screen.findByText("Đã lưu tin. Ngành này chưa hỗ trợ AI; có thể đăng tin và tuyển dụng thủ công.");
  const call = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === "POST")!;
  const savedBody = JSON.parse(call[1]!.body as string);
  expect(savedBody.description).toContain("Lập báo cáo tài chính");
  expect(savedBody.requirementsText).toContain("Kinh nghiệm kế toán");
  expect(savedBody.category).toEqual({ industryId: null, industryName: "Kế toán",
    specializationId: null, specializationName: "Khác", positionId: null, positionName: "Kế toán tổng hợp" });
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.startsWith("/api/v2/parsed-jds"))).toBe(false);
});

it.each([false, true])("submits the explicit JD external AI choice (%s) with the displayed policy", async (consented) => {
  render(<RecruiterJobBoard session={session} companyId="company" canRecruit />);
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo JD mới" }));
  const checkbox = screen.getByRole("checkbox", { name: "Cho phép AI phân tích nội dung này" });
  expect(checkbox).not.toBeChecked();
  if (consented) fireEvent.click(checkbox);
  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Backend" } });
  await setRichText("Mô tả công việc", "Build Java services");
  await setRichText("Yêu cầu", "Java");
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(true));
  const call = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === "POST")!;
  const body = JSON.parse(call[1]!.body as string);
  expect(body.externalAiConsent).toBe(consented);
  expect(body.externalAiPolicyVersion).toBe(consented ? "external-ai/1.0" : null);
});

it("starts a clean JD after returning from a saved job and still protects an unsaved draft", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (options?.method === "POST") return { ...JSON.parse(options.body as string), jobId: "saved-job", jobVersionId: "saved-version",
      jobVersionNumber: 1, companyId: "company", status: "DRAFT", version: 0, matchingSupported: false };
    return { items: [], total: 0, page: 0, size: 12 };
  });
  render(<RecruiterJobBoard session={session} companyId="company" canRecruit />);
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo JD mới" }));
  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Saved job" } });
  await setRichText("Mô tả công việc", "Build services");
  await setRichText("Yêu cầu", "Java");
  fireEvent.click(screen.getByRole("checkbox", { name: "Cho phép AI phân tích nội dung này" }));
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await screen.findByText("Đã lưu tin. Ngành này chưa hỗ trợ AI; có thể đăng tin và tuyển dụng thủ công.");
  expect(screen.queryByRole("button", { name: /Quay lại/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Danh sách tin tuyển dụng" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo JD mới" }));
  expect(screen.getByLabelText("Tiêu đề")).toHaveValue("");
  expect(screen.getByRole("checkbox", { name: "Cho phép AI phân tích nội dung này" })).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Unsaved next job" } });
  fireEvent.click(screen.getByRole("button", { name: "Danh sách tin tuyển dụng" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Bạn còn thay đổi chưa lưu hoặc đang xử lý.");
  expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Unsaved next job");
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
  await setRichText("Mô tả công việc", "Lập báo cáo tài chính");
  await setRichText("Yêu cầu", "Kinh nghiệm kế toán");
  fireEvent.click(screen.getByRole("checkbox", { name: "Cho phép AI phân tích nội dung này" }));
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  await screen.findByRole("button", { name: "Áp dụng gợi ý 1" });
  expect(screen.getByLabelText("Ngành", { exact: true })).toHaveValue("1");
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng gợi ý 1" }));
  expect(screen.getByLabelText("Tên ngành mới")).toHaveValue("Kế toán");
  expect(screen.getByLabelText("Tên vị trí mới")).toHaveValue("Kế toán tổng hợp");
  expect(screen.getByRole("checkbox", { name: "Cho phép AI phân tích nội dung này" })).toBeChecked();
  expect(vi.mocked(apiRequest).mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => /\/dashboard\/catalog/.test(path))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));
  await screen.findByText("Đã lưu tin. Ngành này chưa hỗ trợ AI; có thể đăng tin và tuyển dụng thủ công.");
  const saved = vi.mocked(apiRequest).mock.calls.find(([path, options]) => path === "/api/v2/companies/company/jobs" && options?.method === "POST")!;
  expect(JSON.parse(saved[1]!.body as string).category).toEqual(category);
});

it("renders job specific analytics tab with KPI metrics and conversion funnel", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/api/v2/jobs/job-analytics-test/analytics") {
      return {
        total: 3,
        pending: 2,
        currentSubmitted: 1,
        currentUnderReview: 1,
        reachedUnderReview: 2,
        reachedShortlisted: 1,
        reachedInterview: 0,
        reachedOffered: 0,
        reachedHired: 0,
        rejected: 0,
        withdrawn: 0
      };
    }
    if (path.includes("/applications")) {
      return { items: [], total: 0, page: 0, size: 12 };
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
  const analyticsTabBtn = await screen.findByRole("button", { name: "Thống kê tin này" });
  fireEvent.click(analyticsTabBtn);

  // Verify KPI cards and Funnel
  expect(await screen.findByText("Báo cáo thống kê: DevOps Engineer")).toBeInTheDocument();
  expect(screen.getByText("Tổng hồ sơ nộp")).toBeInTheDocument();
  expect(screen.getByText("Chờ xử lý")).toBeInTheDocument();
  expect(screen.getAllByText("Vào Shortlist").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Xem Kanban Pipeline →" })).toBeInTheDocument();
});

it("loads an older initialJobId by ID when absent from the current page and supports retrying pending ParsedJD", async () => {
  const olderJob = {
    jobId: "old-job-99",
    jobVersionId: "old-ver-99",
    jobVersionNumber: 1,
    companyId: "company",
    title: "Principal Architect",
    description: "<p>Design systems</p>",
    requirementsText: "<ul><li>Java</li></ul>",
    status: "DRAFT",
    version: 1,
    openings: 1,
    salaryNegotiable: true,
    externalAiConsent: false,
    matchingSupported: true,
    category: { industryId: "1", industryName: "IT" }
  };
  let parsedCalls = 0;
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (path === "/api/v2/jobs/old-job-99") return olderJob;
    if (path === "/api/v2/parsed-jds/old-ver-99") {
      parsedCalls += 1;
      return {
        revisionId: "rev-1",
        jobId: "old-job-99",
        jobVersionId: "old-ver-99",
        revisionNumber: 1,
        sourceHash: "h",
        status: "PARSED",
        payload: {
          document: { jobVersionId: "old-ver-99", language: "en", sourceHash: "h", parserVersion: "v1" },
          title: { raw: "Principal Architect", canonicalFamily: "BACKEND", level: "LEAD", confidence: 0.9, evidenceIds: [] },
          requirements: { requiredSkills: [], preferredSkills: [], minimumRelevantExperienceMonths: 60, education: [], languages: [] },
          responsibilities: [],
          overallConfidence: 0.9,
          qualityFlags: []
        },
        confirmedBy: null,
        confirmedAt: null,
        version: 0
      };
    }
    return { items: [], total: 0, page: 0, size: 12 };
  });

  render(<RecruiterJobBoard session={session} companyId="company" canRecruit initialJobId="old-job-99" />);
  expect(await screen.findByRole("heading", { name: "Principal Architect" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra yêu cầu" }));
  await screen.findByText(/Design systems/);
  expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
  expect(parsedCalls).toBeGreaterThanOrEqual(1);
});

it("duplicates a published job into a new editable draft", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (path === "/api/v2/jobs/pub-1") {
      return {
        jobId: "pub-1",
        jobVersionId: "pub-ver-1",
        jobVersionNumber: 1,
        companyId: "company",
        title: "Senior Java Engineer",
        description: "<p>Build services</p>",
        requirementsText: "<ul><li>Java</li></ul>",
        status: "PUBLISHED",
        version: 1,
        openings: 2,
        salaryNegotiable: true,
        externalAiConsent: false,
        matchingSupported: false
      };
    }
    return { items: [], total: 0, page: 0, size: 12 };
  });

  render(<RecruiterJobBoard session={session} companyId="company" canRecruit initialJobId="pub-1" />);
  expect(await screen.findByRole("heading", { name: "Senior Java Engineer" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Chi tiết tin tuyển dụng" }));
  const dupBtn = await screen.findByRole("button", { name: "Nhân bản thành bản nháp" });
  fireEvent.click(dupBtn);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Senior Java Engineer (Bản sao)");
  expect(screen.getByRole("button", { name: "Tạo bản nháp" })).toBeEnabled();
});

it("clears stale salary bounds when salaryNegotiable is checked and displays company-wide job counts", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (String(path).startsWith("/api/v2/dashboard?companyId=")) {
      return { metrics: { jobs: 9, publishedJobs: 5, draftJobs: 2, closedJobs: 2 } };
    }
    if (options?.method === "POST") {
      return {
        ...JSON.parse(options.body as string),
        jobId: "saved-neg",
        jobVersionId: "ver-neg",
        jobVersionNumber: 1,
        companyId: "company",
        status: "DRAFT",
        version: 0,
        matchingSupported: false
      };
    }
    return { items: [], total: 0, page: 0, size: 12 };
  });

  render(<RecruiterJobBoard session={session} companyId="company" canRecruit />);
  expect(await screen.findByText("5")).toBeInTheDocument();
  expect(screen.getByText("9")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "+ Tạo JD mới" }));
  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Product Manager" } });
  await setRichText("Mô tả công việc", "Lead product");
  await setRichText("Yêu cầu", "Roadmap");
  fireEvent.change(screen.getByLabelText("Lương tối thiểu"), { target: { value: "20000000" } });
  fireEvent.change(screen.getByLabelText("Lương tối đa"), { target: { value: "30000000" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Lương thỏa thuận" }));
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));

  await screen.findByText(/Đã lưu tin/);
  const savedCall = vi.mocked(apiRequest).mock.calls.find(
    ([path, options]) => path === "/api/v2/companies/company/jobs" && options?.method === "POST"
  )!;
  const body = JSON.parse(savedCall[1]!.body as string);
  expect(body.salaryNegotiable).toBe(true);
  expect(body.salaryMin).toBeNull();
  expect(body.salaryMax).toBeNull();
  expect(body.salaryCurrency).toBeNull();
  expect(body.salaryPeriod).toBeNull();
});

it("navigates the 3-step stepper to preview and publish a draft job", async () => {
  const draftJob = {
    jobId: "42",
    jobVersionId: "99",
    jobVersionNumber: 1,
    companyId: "company",
    title: "Senior Backend Engineer",
    description: "Build resilient services",
    requirementsText: "Java and Kafka",
    status: "DRAFT",
    version: 1,
    openings: 2,
    salaryNegotiable: true,
    externalAiConsent: false,
    matchingSupported: true,
    category: { industryId: "1", industryName: "IT" }
  };
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (path === "/api/v2/parsed-jds/99") return { status: "CONFIRMED", payload: { requirements: { requiredSkills: [], preferredSkills: [], minimumRelevantExperienceMonths: null }, qualityFlags: [] } };
    if (path === "/api/v2/jobs/42/publish?version=1" && options?.method === "POST") {
      return { ...draftJob, status: "PUBLISHED", version: 2 };
    }
    return { items: [draftJob], total: 1, page: 0, size: 12 };
  });

  render(<RecruiterJobBoard session={session} companyId="company" companyStatus="ACTIVE" canRecruit />);
  fireEvent.click(await screen.findByRole("button", { name: /Senior Backend Engineer/ }));

  const stepper = screen.getByRole("navigation", { name: "Tiến trình tạo và đăng tin" });
  expect(stepper).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /3\s*Xem trước & Đăng tin/ }));
  expect(screen.getByText("Xem trước góc nhìn ứng viên")).toBeInTheDocument();
  expect(await screen.findByText("AI JD đã xác nhận")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Đăng tin tuyển dụng" }));
  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v2/jobs/42/publish?version=1",
      expect.objectContaining({ method: "POST" })
    )
  );
});

it("renders clean recruiter job card metadata and action buttons without decorative emojis", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/api/v2/public/job-categories") return [];
    return {
      items: [
        {
          jobId: "90",
          jobVersionId: "900",
          jobVersionNumber: 1,
          companyId: "company",
          title: "Nhân viên vận hành kho",
          description: "<p>Kiểm kê hàng hóa theo ca</p>",
          requirementsText: "Cẩn thận",
          locationText: "Hà Nội",
          workMode: "ONSITE",
          status: "CLOSED",
          version: 1,
          openings: 1,
          salaryNegotiable: false,
          matchingSupported: false,
          category: { industryId: null, industryName: "Chưa phân loại" }
        }
      ],
      total: 1,
      page: 0,
      size: 12
    };
  });

  render(<RecruiterJobBoard session={session} companyId="company" companyStatus="ACTIVE" canRecruit />);
  const titleBtn = await screen.findByRole("button", { name: "Nhân viên vận hành kho" });
  const card = titleBtn.closest("article")!;
  expect(within(card).getByText("Đã đóng")).toBeInTheDocument();
  expect(within(card).getByText("Sàng lọc thủ công")).toBeInTheDocument();
  expect(within(card).getByText("1 chỉ tiêu")).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "Ứng viên & Pipeline" })).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "Thống kê" })).toBeInTheDocument();
  expect(within(card).getByRole("button", { name: "Chi tiết tin" })).toBeInTheDocument();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{`${location.pathname}${location.search}`}</output>;
}

it("syncs URL when creating, saving, and returning to the recruiter job list", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/public/job-categories") return [];
    if (options?.method === "POST") {
      return {
        ...JSON.parse(options.body as string),
        jobId: "job-123",
        jobVersionId: "ver-1",
        jobVersionNumber: 1,
        companyId: "company",
        status: "DRAFT",
        version: 0,
        matchingSupported: false
      };
    }
    return { items: [], total: 0, page: 0, size: 12 };
  });

  render(
    <MemoryRouter initialEntries={["/recruiter/jobs"]}>
      <LocationProbe />
      <RecruiterJobBoard session={session} companyId="company" canRecruit />
    </MemoryRouter>
  );

  expect(screen.getByTestId("location-probe")).toHaveTextContent("/recruiter/jobs");
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo JD mới" }));
  expect(screen.getByTestId("location-probe")).toHaveTextContent("/recruiter/jobs/new");

  fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Frontend Engineer" } });
  fireEvent.change(screen.getByLabelText("Tỉnh / Thành phố"), { target: { value: "Hà Nội" } });
  fireEvent.change(screen.getByLabelText("Địa chỉ cụ thể"), { target: { value: "Tòa FPT Tower, Cầu Giấy" } });
  await setRichText("Mô tả công việc", "Build React UI");
  await setRichText("Yêu cầu", "TypeScript");
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản nháp" }));

  await waitFor(() => expect(screen.getByTestId("location-probe")).toHaveTextContent("/recruiter/jobs/job-123?tab=editor"));
  expect(apiRequest).toHaveBeenCalledWith(
    "/api/v2/companies/company/jobs",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"province\":\"Hà Nội\"")
    })
  );

  fireEvent.click(screen.getByRole("button", { name: "Danh sách tin tuyển dụng" }));
  expect(screen.getByTestId("location-probe")).toHaveTextContent("/recruiter/jobs");
});

it("opens the new-job workspace directly when mounted at /recruiter/jobs/new", () => {
  render(
    <MemoryRouter initialEntries={["/recruiter/jobs/new"]}>
      <RecruiterJobBoard session={session} companyId="company" canRecruit initialNewJob />
    </MemoryRouter>
  );

  expect(screen.getByRole("heading", { name: "Tạo tin tuyển dụng mới" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "+ Tạo JD mới" })).not.toBeInTheDocument();
});
