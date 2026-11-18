import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { CompanyReviewPanel } from "./CompanyReviewPanel";

vi.mock("../../shared/api/client", async (original) => ({ ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn() }));
const company = { companyId: "9007199254740993", legalName: "Synthetic Legal", displayName: "Synthetic Company",
  slug: "synthetic", description: "Build services", countryCode: "VN", registrationNumber: null,
  status: "PENDING", verificationStatus: "UNVERIFIED", version: 7 };

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith("/history") ? []
    : { items: [company], total: 1, page: 0, size: 20 });
});

it("requires a separate review and reason, preserves the shown version and displays the approval audit", async () => {
  let approved = false;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path.endsWith("/approve") && options?.method === "POST") {
      approved = true;
      return { ...company, status: "ACTIVE", version: 8 };
    }
    if (path.endsWith("/history")) return approved ? [{ id: "1", actorUserId: "9", fromStatus: "PENDING", toStatus: "ACTIVE",
      version: 8, reason: "Đã kiểm tra", occurredAt: "2026-11-13T00:00:00Z" }] : [];
    return { items: approved ? [] : [company], total: approved ? 0 : 1, page: 0, size: 20 };
  });
  render(<CompanyReviewPanel accessToken="synthetic" />);
  expect(screen.queryByRole("button", { name: "Duyệt hoạt động" })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Xem xét Synthetic Company" }));
  const approve = screen.getByRole("button", { name: "Duyệt hoạt động" });
  expect(approve).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Lý do duyệt"), { target: { value: "  Đã kiểm tra  " } });
  fireEvent.click(approve);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v2/dashboard/companies/9007199254740993/approve",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ version: 7, reason: "Đã kiểm tra" }) })));
  expect(await screen.findByText(/Đã duyệt Synthetic Company/)).toBeVisible();
  expect(await screen.findByText("Admin #9 · Phiên bản 8")).toBeVisible();
  expect(screen.getByText("Chưa xác minh")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Duyệt hoạt động" })).not.toBeInTheDocument();
});

it("keeps the reason after a conflict and requires an explicit reload before further approval", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method === "POST") throw new ApiClientError(409, { code: "COMPANY_CONFLICT", message: "Changed" } as never);
    return path.endsWith("/history") ? [] : { items: [company], total: 1, page: 0, size: 20 };
  });
  render(<CompanyReviewPanel accessToken="synthetic" />);
  fireEvent.click(await screen.findByRole("button", { name: "Xem xét Synthetic Company" }));
  fireEvent.change(screen.getByLabelText("Lý do duyệt"), { target: { value: "Reviewed reason" } });
  fireEvent.click(screen.getByRole("button", { name: "Duyệt hoạt động" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Công ty đã thay đổi");
  expect(screen.getByLabelText("Lý do duyệt")).toHaveValue("Reviewed reason");
  expect(screen.getByRole("button", { name: "Duyệt hoạt động" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Tải lại danh sách" }));
  expect(screen.queryByRole("button", { name: "Duyệt hoạt động" })).not.toBeInTheDocument();
});

it("filters the paged queue and does not offer approval for ACTIVE companies", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith("/history") ? []
    : { items: [{ ...company, status: "ACTIVE" }], total: 1, page: 0, size: 20 });
  render(<CompanyReviewPanel accessToken="synthetic" />);
  fireEvent.change(screen.getByLabelText("Trạng thái công ty"), { target: { value: "ACTIVE" } });
  fireEvent.change(screen.getByLabelText("Tìm công ty"), { target: { value: "Synthetic" } });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringMatching(/status=ACTIVE&q=Synthetic&page=0&size=20/), expect.anything()));
  fireEvent.click(await screen.findByRole("button", { name: "Xem xét Synthetic Company" }));
  expect(screen.queryByRole("button", { name: "Duyệt hoạt động" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tạm ngưng hoạt động" })).toBeDisabled();
});

it("supports rejecting pending, suspending active, and reactivating suspended companies", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path.endsWith("/reject") && options?.method === "POST") return { ...company, status: "CLOSED", version: 8 };
    if (path.endsWith("/suspend") && options?.method === "POST") return { ...company, status: "SUSPENDED", version: 9 };
    if (path.endsWith("/reactivate") && options?.method === "POST") return { ...company, status: "ACTIVE", version: 10 };
    if (path.endsWith("/history")) return [];
    if (path.includes("status=ACTIVE")) return { items: [{ ...company, status: "ACTIVE", version: 8 }], total: 1, page: 0, size: 20 };
    return { items: [company], total: 1, page: 0, size: 20 };
  });

  render(<CompanyReviewPanel accessToken="synthetic" />);
  fireEvent.click(await screen.findByRole("button", { name: "Xem xét Synthetic Company" }));
  fireEvent.change(screen.getByLabelText("Lý do duyệt"), { target: { value: "Hồ sơ không hợp lệ" } });
  fireEvent.click(screen.getByRole("button", { name: "Từ chối đăng ký" }));
  expect(await screen.findByText(/Đã từ chối đăng ký công ty Synthetic Company/)).toBeVisible();

  fireEvent.change(screen.getByLabelText("Trạng thái công ty"), { target: { value: "ACTIVE" } });
  fireEvent.click(await screen.findByRole("button", { name: "Xem xét Synthetic Company" }));
  fireEvent.change(screen.getByLabelText("Lý do tạm ngưng"), { target: { value: "Vi phạm chính sách" } });
  fireEvent.click(screen.getByRole("button", { name: "Tạm ngưng hoạt động" }));
  expect(await screen.findByText(/Đã tạm ngưng hoạt động Synthetic Company/)).toBeVisible();

  fireEvent.change(screen.getByLabelText("Lý do kích hoạt lại"), { target: { value: "Đã khắc phục" } });
  fireEvent.click(screen.getByRole("button", { name: "Kích hoạt lại" }));
  expect(await screen.findByText(/Đã kích hoạt lại Synthetic Company/)).toBeVisible();
});
