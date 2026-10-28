import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { AdminAuditPanel } from "./AdminAuditPanel";

vi.mock("../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const actorId = "9007199254740993";
const resourceId = "9223372036854775807";
const correlationId = "33333333-3333-4333-8333-333333333333";
const core = { id: 1, resourceId, actorUserId: actorId, action: "EDIT", version: 3, reason: "Synthetic Core edit", correlationId,
  occurredAt: "2026-10-02T00:00:00Z", beforeState: '{"name":"Old category"}', afterState: '{"name":"Current category","status":"ACTIVE"}' };
beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    const url = new URL(path, "http://synthetic.local");
    return { items: [core], total: 21, page: Number(url.searchParams.get("page") ?? "0"), size: 20 };
  });
});
function lastQuery() { return new URL(vi.mocked(apiRequest).mock.calls.at(-1)![0], "http://synthetic.local"); }

it("queries explicit Core filters and resets the requested page", async () => {
  render(<AdminAuditPanel accessToken="synthetic-admin" />);
  await screen.findByText("21 thay đổi · Trang 1 · Danh mục nghề (Core)");
  fireEvent.click(screen.getByRole("button", { name: "Trang nhật ký sau" }));
  await screen.findByText("21 thay đổi · Trang 2 · Danh mục nghề (Core)");
  fireEvent.change(screen.getByLabelText("ID người thực hiện"), { target: { value: actorId } });
  fireEvent.change(screen.getByLabelText("ID danh mục / kỹ năng"), { target: { value: resourceId } });
  fireEvent.change(screen.getByLabelText("Hành động nhật ký"), { target: { value: "EDIT" } });
  fireEvent.change(screen.getByLabelText("Mã tương quan nhật ký"), { target: { value: correlationId } });
  fireEvent.change(screen.getByLabelText("Thời gian từ (giờ địa phương)"), { target: { value: "2026-10-01T08:00" } });
  fireEvent.change(screen.getByLabelText("Thời gian đến (giờ địa phương)"), { target: { value: "2026-10-03T08:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm nhật ký" }));
  await waitFor(() => expect(Object.fromEntries(lastQuery().searchParams)).toEqual({ page: "0", size: "20",
    actorUserId: actorId, resourceId, action: "EDIT", correlationId,
    from: new Date("2026-10-01T08:00").toISOString(), to: new Date("2026-10-03T08:00").toISOString() }));
  expect(lastQuery().pathname).toBe("/api/v2/dashboard/catalog/history");
});

it("switches to AI history as a separate request and maps only its actorId filter", async () => {
  render(<AdminAuditPanel accessToken="synthetic-admin" />);
  await screen.findByText("Synthetic Core edit");
  fireEvent.change(screen.getByLabelText("ID người thực hiện"), { target: { value: actorId } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm nhật ký" }));
  await waitFor(() => expect(lastQuery().searchParams.get("actorUserId")).toBe(actorId));
  vi.mocked(apiRequest).mockResolvedValue({ items: [{ id: "ai-history", resourceId, actorId, action: "APPROVE", version: 8,
    reason: "Synthetic AI review", correlationId, createdAt: "2026-10-02T00:00:00Z", before: null,
    after: { canonicalName: "CanonicalX", status: "ACTIVE" }, redacted: false }], total: 1, page: 0, size: 20 });
  fireEvent.change(screen.getByLabelText("Nguồn nhật ký"), { target: { value: "AI" } });
  await screen.findByText("Synthetic AI review");
  expect(lastQuery().pathname).toBe("/api/v2/taxonomy/skills/history");
  expect(lastQuery().searchParams.has("actorUserId")).toBe(false);
  expect(lastQuery().searchParams.has("actorId")).toBe(false);
  expect(screen.getByLabelText("ID người thực hiện")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("ID người thực hiện"), { target: { value: actorId } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm nhật ký" }));
  await waitFor(() => expect(lastQuery().searchParams.get("actorId")).toBe(actorId));
  expect(lastQuery().searchParams.has("actorUserId")).toBe(false);
  expect(screen.queryByText("Synthetic Core edit")).not.toBeInTheDocument();
});

it("identifies legacy metadata and renders only the bounded audit state fields", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [{ ...core, version: null, reason: null, correlationId: null,
    beforeState: "invalid-json", afterState: '{"name":"Legacy category","rawContext":"DO_NOT_RENDER_CONTEXT"}' }], total: 1, page: 0, size: 20 });
  render(<AdminAuditPanel accessToken="synthetic-admin" />);
  await screen.findByText("Chưa được ghi (dữ liệu cũ) → Legacy category");
  expect(screen.getAllByText("Chưa được ghi (dữ liệu cũ)")).toHaveLength(3);
  expect(screen.queryByText(/DO_NOT_RENDER_CONTEXT/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Trang nhật ký sau" })).toBeDisabled();
});

it("labels the redacted AI projection without exposing extra historical fields", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ items: [], total: 0, page: 0, size: 20 });
  render(<AdminAuditPanel accessToken="synthetic-admin" />);
  await screen.findByText("Không có thay đổi phù hợp bộ lọc.");
  vi.mocked(apiRequest).mockResolvedValueOnce({ items: [{ id: "ai-redacted", resourceId, actorId, action: "PROPOSE", version: 1,
    reason: "Source [REDACTED_EMAIL]", correlationId: null, createdAt: "2026-10-02T00:00:00Z", before: null,
    after: { canonicalName: "[REDACTED_EMAIL]", privateSourceText: "DO_NOT_RENDER_SOURCE" }, redacted: true }], total: 1, page: 0, size: 20 });
  fireEvent.change(screen.getByLabelText("Nguồn nhật ký"), { target: { value: "AI" } });
  await screen.findByText("Thông tin liên hệ đã được che trong bản ghi này.");
  expect(screen.getByText("Source [REDACTED_EMAIL]")).toBeInTheDocument();
  expect(screen.queryByText(/DO_NOT_RENDER_SOURCE/)).not.toBeInTheDocument();
});

it("rejects an inverted time window before requesting history", async () => {
  render(<AdminAuditPanel accessToken="synthetic-admin" />);
  await screen.findByText("Synthetic Core edit");
  const calls = vi.mocked(apiRequest).mock.calls.length;
  fireEvent.change(screen.getByLabelText("Thời gian từ (giờ địa phương)"), { target: { value: "2026-10-03T08:00" } });
  fireEvent.change(screen.getByLabelText("Thời gian đến (giờ địa phương)"), { target: { value: "2026-10-01T08:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm nhật ký" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Thời điểm bắt đầu");
  expect(vi.mocked(apiRequest).mock.calls).toHaveLength(calls);
});

it("retries the same applied filters after an API failure", async () => {
  render(<AdminAuditPanel accessToken="synthetic-admin" />);
  await screen.findByText("Synthetic Core edit");
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Synthetic audit error"));
  fireEvent.change(screen.getByLabelText("ID danh mục / kỹ năng"), { target: { value: resourceId } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm nhật ký" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Làm mới nhật ký" }));
  await screen.findByText("Synthetic Core edit");
  expect(lastQuery().searchParams.get("resourceId")).toBe(resourceId);
  expect(screen.getByLabelText("ID danh mục / kỹ năng")).toHaveValue(resourceId);
});
