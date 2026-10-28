import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { PendingSkillQueue, PendingSkillSources } from "./PendingSkillQueue";

vi.mock("../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const item = { skillId: "skill-id", name: "SyntheticX", status: "PENDING", type: "framework", category: "backend",
  occurrenceCount: 3, sourceCount: 2, firstSeen: "2026-10-01T00:00:00Z", lastSeen: "2026-10-02T00:00:00Z" };
const props = { accessToken: "synthetic-admin", catalogVersion: 4, disabled: false, selected: "",
  onSelect: vi.fn(async () => undefined), types: [{ value: "framework", label: "Framework" }],
  categories: [{ value: "backend", label: "Backend" }] };
const occurrence = { occurrenceId: "occurrence-id", sourceKind: "JD", sourceVersionId: "source-version-id",
  firstRevisionId: "first-revision-id", latestRevisionId: "latest-revision-id", fieldRole: "JD.requiredSkills",
  rawTerm: "SyntheticX", provenance: "USER_ASSERTED", normalizationStatus: "PENDING", confidence: null,
  evidenceRefs: [{ id: "evidence-id", page: null }],
  context: { fieldRole: "JD.requiredSkills", provenance: "USER_ASSERTED", sourceConfirmed: false, criticality: "CRITICAL", knownSkillIds: ["known-id"] },
  firstSeen: "2026-10-01T00:00:00Z", lastSeen: "2026-10-02T00:00:00Z" };

beforeEach(() => {
  vi.mocked(apiRequest).mockReset(); props.onSelect.mockClear();
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    const url = new URL(path, "http://synthetic.local");
    const page = Number(url.searchParams.get("page") ?? "0");
    if (path.includes("/occurrences?")) return { page, size: 20, totalElements: 21, items: [occurrence] };
    if (!url.search && url.pathname.includes("pending-skills/")) return {
      occurrenceCount: 3, sourceCount: 2, firstSeen: item.firstSeen, lastSeen: item.lastSeen
    };
    return { catalogVersion: 4, taxonomyVersion: "1.0.1", page, size: 20, totalElements: 21, items: [item] };
  });
});

it("uses the selected queue filters and resets pagination when changing scope", async () => {
  render(<PendingSkillQueue {...props} />);
  await screen.findByRole("button", { name: "SyntheticX" });
  fireEvent.click(screen.getByRole("button", { name: "Trang đề xuất sau" }));
  await screen.findByText("21 kỹ năng · Trang 2");
  fireEvent.change(screen.getByLabelText("Trạng thái đề xuất"), { target: { value: "DEFERRED" } });
  fireEvent.change(screen.getByLabelText("Nguồn đề xuất"), { target: { value: "CV" } });
  fireEvent.change(screen.getByLabelText("Lọc loại kỹ năng"), { target: { value: "framework" } });
  fireEvent.change(screen.getByLabelText("Lọc nhóm kỹ năng"), { target: { value: "backend" } });
  fireEvent.change(screen.getByLabelText("Sắp xếp đề xuất"), { target: { value: "LAST_SEEN_DESC" } });
  fireEvent.change(screen.getByLabelText("Tìm thuật ngữ"), { target: { value: "  Synthetic X  " } });
  fireEvent.click(screen.getByRole("button", { name: "Tìm kỹ năng" }));
  await waitFor(() => {
    const path = vi.mocked(apiRequest).mock.calls.at(-1)![0];
    const query = new URL(path, "http://synthetic.local").searchParams;
    expect(Object.fromEntries(query)).toEqual({ page: "0", size: "20", status: "DEFERRED", sourceKind: "CV",
      type: "framework", category: "backend", sort: "LAST_SEEN_DESC", q: "Synthetic X" });
  });
  await screen.findByText("21 kỹ năng · Trang 1");
  fireEvent.click(screen.getByRole("button", { name: "SyntheticX" }));
  expect(props.onSelect).toHaveBeenCalledWith("skill-id");
});

it("retains queue filters on a retry and represents legacy zero counts without invented dates", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ catalogVersion: 4, taxonomyVersion: "1.0.1", page: 0, size: 20,
    totalElements: 1, items: [{ ...item, occurrenceCount: 0, sourceCount: 0, firstSeen: null, lastSeen: null }] });
  render(<PendingSkillQueue {...props} />);
  await screen.findByRole("cell", { name: "0 lần ghi nhận · 0 phiên bản nguồn" });
  expect(screen.getByText("Đầu tiên: Chưa được ghi · Gần nhất: Chưa được ghi")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Trang đề xuất sau" })).toBeDisabled();
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Synthetic queue failure"));
  fireEvent.change(screen.getByLabelText("Trạng thái đề xuất"), { target: { value: "DEFERRED" } });
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Tải lại hàng chờ" }));
  await screen.findByRole("button", { name: "SyntheticX" });
  expect(new URL(vi.mocked(apiRequest).mock.calls.at(-1)![0], "http://synthetic.local").searchParams.get("status")).toBe("DEFERRED");
});

it("explains partial ledger coverage when new unmapped terms exceed catalog capacity", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ catalogVersion: 4, taxonomyVersion: "1.0.1", page: 0, size: 20,
    totalElements: 1, items: [item], catalogCapacity: { limit: 1000, used: 1000, reached: true, unmappedTermsMayBeSkipped: true } });
  render(<PendingSkillQueue {...props} />);
  await screen.findByRole("button", { name: "SyntheticX" });
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("1000/1000");
  expect(status).toHaveTextContent("Thuật ngữ mới chưa map có thể chưa xuất hiện");
  expect(status).toHaveTextContent("nguồn đã ghi nhận");
  expect(screen.getByRole("cell", { name: "3 lần ghi nhận · 2 phiên bản nguồn" })).toBeInTheDocument();
});

it("shows bounded source metadata and only coordinates the server actually recorded", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path.includes("/occurrences?")
    ? { page: 0, size: 20, totalElements: 1, items: [{ ...occurrence, ownerEmail: "DO_NOT_RENDER_OWNER",
      sourceText: "DO_NOT_RENDER_SOURCE_TEXT", objectUrl: "https://synthetic.local/DO_NOT_RENDER_PDF",
      context: { ...occurrence.context, rawText: "DO_NOT_RENDER_RAW_CONTEXT" } }] }
    : { occurrenceCount: 1, sourceCount: 1, firstSeen: null, lastSeen: null });
  render(<PendingSkillSources accessToken="synthetic-admin" selected="skill-id" catalogVersion={4}
    skills={[{ stableId: "known-id", canonicalName: "Java" }]} />);
  const region = within(await screen.findByRole("region", { name: "Nguồn kỹ năng" }));
  await region.findByText("source-version-id");
  expect(region.getByText("first-revision-id")).toBeInTheDocument();
  expect(region.getByText("latest-revision-id")).toBeInTheDocument();
  expect(region.getByText("JD · Kỹ năng bắt buộc JD · Người dùng bổ sung · Chờ chuẩn hóa")).toBeInTheDocument();
  expect(region.getByText("Java", { exact: true })).toBeInTheDocument();
  expect(region.getByText("Tham chiếu evidence: evidence-id")).toBeInTheDocument();
  expect(region.queryByText(/trang 0|vị trí undefined|NaN/)).not.toBeInTheDocument();
  expect(region.queryByText(/DO_NOT_RENDER/)).not.toBeInTheDocument();
  expect(region.queryByRole("link")).not.toBeInTheDocument();
});

it("pages source occurrences and resets the page for a different source filter", async () => {
  render(<PendingSkillSources accessToken="synthetic-admin" selected="skill-id" catalogVersion={4} skills={[]} />);
  await screen.findByText("21 lần ghi nhận · Trang 1");
  fireEvent.click(screen.getByRole("button", { name: "Trang nguồn sau" }));
  await screen.findByText("21 lần ghi nhận · Trang 2");
  fireEvent.change(screen.getByLabelText("Lọc nguồn ghi nhận"), { target: { value: "CV" } });
  await screen.findByText("21 lần ghi nhận · Trang 1");
  const query = new URL(vi.mocked(apiRequest).mock.calls.at(-1)![0], "http://synthetic.local").searchParams;
  expect(Object.fromEntries(query)).toEqual({ page: "0", size: "20", sourceKind: "CV" });
});

it("keeps a detail failure visible when the source filter changes and retries both requests", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.includes("/occurrences?")) return { page: 0, size: 20, totalElements: 0, items: [] };
    throw new Error("Synthetic detail failure");
  });
  render(<PendingSkillSources accessToken="synthetic-admin" selected="skill-id" catalogVersion={4} skills={[]} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic detail failure");
  fireEvent.change(screen.getByLabelText("Lọc nguồn ghi nhận"), { target: { value: "JD" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Synthetic detail failure");
  vi.mocked(apiRequest).mockImplementation(async (path) => path.includes("/occurrences?")
    ? { page: 0, size: 20, totalElements: 0, items: [] }
    : { occurrenceCount: 0, sourceCount: 0, firstSeen: null, lastSeen: null });
  fireEvent.click(screen.getByRole("button", { name: "Tải lại nguồn kỹ năng" }));
  await screen.findByText("0 lần ghi nhận · 0 phiên bản nguồn · Đầu tiên: Chưa được ghi · Gần nhất: Chưa được ghi");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
