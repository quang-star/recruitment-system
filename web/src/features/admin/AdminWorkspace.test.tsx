import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminWorkspace } from "./AdminWorkspace";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
vi.mock("../../shared/api/client", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../shared/api/client")>(), apiRequest: vi.fn()
}));
const session = { accessToken: "admin", userId: "admin", roles: ["SYSTEM_ADMIN"] } as AuthSession;
const skill = { stableId: "skill", canonicalName: "NewX", status: "PENDING", aliases: [],
  type: "other", category: "cross_functional", relations: [] };
const catalog = { version: 4, taxonomyVersion: "1.0.1", skills: [skill,
  { ...skill, stableId: "active", canonicalName: "ActiveTarget", status: "ACTIVE" },
  { ...skill, stableId: "deferred", canonicalName: "DeferredTarget", status: "DEFERRED" }] };
function emptyLedger(path: string) {
  if (!path.startsWith("/api/v2/taxonomy/pending-skills")) return undefined;
  if (path.includes("/candidates?")) return { taxonomyVersion: "1.0.1", resolution: "UNRESOLVED", requiresReview: true,
    candidates: [], semanticStatus: "DISABLED", algorithmVersion: "skill-candidate-ranking-v1", scorePolicy: "RANKING_ONLY_UNCALIBRATED",
    rankingMethod: "FUZZY_RATIO", fuzzyMethod: "SEQUENCE_MATCHER_RATIO_AUTOJUNK", modelId: null, modelRevision: null };
  if (path.includes("/occurrences?") || path.includes("pending-skills?")) return {
    catalogVersion: 4, taxonomyVersion: "1.0.1", page: 0, size: 20, totalElements: 0, items: []
  };
  return { occurrenceCount: 0, sourceCount: 0, firstSeen: null, lastSeen: null };
}

function reason(value = "Đã kiểm tra đề xuất") {
  fireEvent.change(screen.getByLabelText("Lý do thay đổi"), { target: { value } });
}
async function selectSkill(id = "skill") {
  fireEvent.click(screen.getByRole("button", { name: "Kỹ năng / tên gọi khác" }));
  await screen.findByRole("option", { name: "NewX · PENDING" });
  fireEvent.change(screen.getByLabelText("Danh mục", { exact: true }), { target: { value: id } });
}
function mutationBody() {
  const call = [...vi.mocked(apiRequest).mock.calls].reverse().find(([, options]) => options?.method);
  return call?.[1]?.body ? JSON.parse(String(call[1].body)) : null;
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method) return {};
    if (path.includes("catalog/history?")) return { items: [], total: 0, page: 0, size: 20 };
    const ledger = emptyLedger(path); if (ledger) return ledger;
    if (path === "/api/v2/dashboard/catalog") return [{ id: "pending", kind: "INDUSTRY", parentId: null, name: "Ngành mới", status: "PENDING", version: 3 }];
    return catalog;
  });
});

it("approves a pending category using its shown version", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await screen.findByRole("option", { name: "Ngành mới · PENDING" });
  fireEvent.change(screen.getByLabelText("Danh mục", { exact: true }), { target: { value: "pending" } });
  fireEvent.change(screen.getByLabelText("Tên", { exact: true }), { target: { value: "Tên đã kiểm tra" } });
  reason("  Chuẩn hóa tên trước khi duyệt  ");
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v2/dashboard/catalog/pending", expect.objectContaining({
    method: "PUT", body: JSON.stringify({ version: 3, action: "APPROVE", reason: "Chuẩn hóa tên trước khi duyệt", name: "Tên đã kiểm tra", mergeTargetId: null })
  })));
});

it("edits aliases with the current catalog version and displays a conflict without losing input", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await selectSkill();
  fireEvent.change(screen.getByLabelText("Tên gọi khác (mỗi dòng một tên)"), { target: { value: "NFX" } });
  fireEvent.change(screen.getByLabelText("Loại kỹ năng"), { target: { value: "framework" } });
  fireEvent.change(screen.getByLabelText("Nhóm kỹ năng"), { target: { value: "backend" } });
  reason("Đã đối chiếu tên gọi");
  vi.mocked(apiRequest).mockRejectedValueOnce(new ApiClientError(409, { code: "CATALOG_CONFLICT",
    message: "Catalog changed; reload before retrying", details: {}, correlationId: "conflict-id", timestamp: "2026-10-02T00:00:00Z" }));
  fireEvent.click(screen.getByRole("button", { name: "Lưu sửa đổi" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Catalog changed");
  expect(screen.getByLabelText("Tên gọi khác (mỗi dòng một tên)")).toHaveValue("NFX");
  expect(screen.getByLabelText("Loại kỹ năng")).toHaveValue("framework");
  expect(screen.getByLabelText("Nhóm kỹ năng")).toHaveValue("backend");
  expect(screen.getByLabelText("Lý do thay đổi")).toHaveValue("Đã đối chiếu tên gọi");
  expect(screen.getByRole("button", { name: "Lưu sửa đổi" })).toBeDisabled();
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method) return {};
    const ledger = emptyLedger(path); if (ledger) return ledger;
    return { ...catalog, version: 5 };
  });
  fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Lưu sửa đổi" })).toBeEnabled());
  expect(screen.getByLabelText("Tên gọi khác (mỗi dòng một tên)")).toHaveValue("NFX");
  fireEvent.click(screen.getByRole("button", { name: "Lưu sửa đổi" }));
  await waitFor(() => expect(mutationBody()).toEqual({ version: 5, action: "EDIT", skillId: "skill", reason: "Đã đối chiếu tên gọi",
    name: "NewX", aliases: ["NFX"], type: "framework", category: "backend", relations: [], mergeTargetId: null }));
});

it("opens audit search without loading either catalog and keeps the services separate", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await screen.findByRole("option", { name: "Ngành mới · PENDING" });
  vi.mocked(apiRequest).mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Nhật ký thay đổi" }));
  await screen.findByText("Không có thay đổi phù hợp bộ lọc.");
  expect(vi.mocked(apiRequest).mock.calls.map(([path]) => path)).toEqual(["/api/v2/dashboard/catalog/history?page=0&size=20"]);
  expect(screen.queryByLabelText("Lý do thay đổi")).not.toBeInTheDocument();
});

it("keeps one source and candidate panel while switching skills repeatedly", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await selectSkill();
  for (const id of ["active", "skill", "deferred", "skill"]) {
    fireEvent.change(screen.getByLabelText("Danh mục", { exact: true }), { target: { value: id } });
    await waitFor(() => expect(screen.getAllByRole("region", { name: "Nguồn kỹ năng" })).toHaveLength(1));
    expect(screen.getAllByRole("button", { name: "Làm mới nguồn kỹ năng" })).toHaveLength(1);
    expect(screen.getAllByRole("region", { name: "Gợi ý chuẩn hóa kỹ năng" })).toHaveLength(1);
  }
});

it("waits for the skill catalog version before allowing a write", async () => {
  let resolveCatalog!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method) return {};
    const ledger = emptyLedger(path); if (ledger) return ledger;
    if (path === "/api/v2/dashboard/catalog") return [];
    return new Promise((resolve) => { resolveCatalog = resolve; });
  });
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Kỹ năng / tên gọi khác" }));
  const submit = screen.getByRole("button", { name: "Thêm danh mục" });
  expect(submit).toBeDisabled();
  expect(screen.getByLabelText("Tên", { exact: true })).toBeDisabled();
  resolveCatalog({ version: 7, taxonomyVersion: "1.0.7", skills: [] });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Tên", { exact: true }), { target: { value: "SyntheticSkill" } });
  reason();
  fireEvent.click(submit);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v2/taxonomy/skills", expect.objectContaining({
    method: "POST", body: JSON.stringify({ version: 7, action: "CREATE", skillId: null,
      reason: "Đã kiểm tra đề xuất", name: "SyntheticSkill", aliases: [], type: "other", category: "cross_functional", relations: [], mergeTargetId: null })
  })));
});

it("requires a meaningful reason before deferring and sends no editor changes", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await screen.findByRole("option", { name: "Ngành mới · PENDING" });
  fireEvent.change(screen.getByLabelText("Danh mục", { exact: true }), { target: { value: "pending" } });
  reason("   ");
  fireEvent.click(screen.getByRole("button", { name: "Tạm hoãn" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Nhập lý do");
  expect(mutationBody()).toBeNull();
  reason("Cần bổ sung nguồn");
  fireEvent.click(screen.getByRole("button", { name: "Tạm hoãn" }));
  await waitFor(() => expect(mutationBody()).toEqual({ version: 3, action: "DEFER", reason: "Cần bổ sung nguồn", mergeTargetId: null }));
});

it("requires reopening a deferred skill before editing or approving it", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await selectSkill("deferred");
  expect(screen.queryByRole("button", { name: "Duyệt" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Gộp danh mục" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Lưu sửa đổi" })).toBeDisabled();
  expect(screen.getByLabelText("Tên", { exact: true })).toBeDisabled();
  reason("Đã nhận nguồn bổ sung");
  fireEvent.click(screen.getByRole("button", { name: "Mở lại đề xuất" }));
  await waitFor(() => expect(mutationBody()).toEqual({ version: 4, action: "REOPEN", skillId: "deferred", reason: "Đã nhận nguồn bổ sung", mergeTargetId: null }));
});

it("approves the edited skill metadata and relation together with one version", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await selectSkill();
  fireEvent.change(screen.getByLabelText("Tên", { exact: true }), { target: { value: "VerifiedX" } });
  fireEvent.change(screen.getByLabelText("Tên gọi khác (mỗi dòng một tên)"), { target: { value: " VX \nVerified framework" } });
  fireEvent.change(screen.getByLabelText("Loại kỹ năng"), { target: { value: "framework" } });
  fireEvent.change(screen.getByLabelText("Nhóm kỹ năng"), { target: { value: "backend" } });
  fireEvent.click(screen.getByRole("button", { name: "Thêm quan hệ" }));
  const targets = within(screen.getByLabelText("Kỹ năng đích 1"));
  expect(targets.getByRole("option", { name: "ActiveTarget" })).toBeInTheDocument();
  expect(targets.queryByRole("option", { name: "DeferredTarget" })).not.toBeInTheDocument();
  expect(targets.queryByRole("option", { name: "NewX" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Kỹ năng đích 1"), { target: { value: "active" } });
  fireEvent.change(screen.getByLabelText("Loại quan hệ 1"), { target: { value: "NARROWER" } });
  reason("Chuẩn hóa tên và quan hệ");
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  await waitFor(() => expect(mutationBody()).toEqual({ version: 4, action: "APPROVE", skillId: "skill", reason: "Chuẩn hóa tên và quan hệ",
    name: "VerifiedX", aliases: ["VX", "Verified framework"], type: "framework", category: "backend",
    relations: [{ type: "NARROWER", targetSkillId: "active" }], mergeTargetId: null }));
});

it("does not publish an incomplete relation and allows removing the draft row", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await selectSkill();
  fireEvent.click(screen.getByRole("button", { name: "Thêm quan hệ" }));
  reason();
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("kỹ năng đích đang hoạt động");
  expect(mutationBody()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Xóa quan hệ 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  await waitFor(() => expect(mutationBody()).toMatchObject({ action: "APPROVE", relations: [] }));
});

it("shows auditable category history while explicitly identifying missing legacy fields", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith("/history") ? [{
    id: 1, action: "DEFER", actorUserId: "reviewer-id", version: 4, reason: "Cần bổ sung nguồn", correlationId: "request-id",
    occurredAt: "2026-10-02T00:00:00Z", beforeState: '{"name":"Ngành mới","status":"PENDING","version":3}',
    afterState: '{"name":"Ngành mới","status":"DEFERRED","version":4}'
  }, { id: 2, action: "PROPOSE", afterState: '{"name":"Ngành mới","status":"PENDING","version":0}' }]
    : [{ id: "pending", kind: "INDUSTRY", parentId: null, name: "Ngành mới", status: "DEFERRED", version: 4 }]);
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await screen.findByRole("option", { name: "Ngành mới · DEFERRED" });
  fireEvent.change(screen.getByLabelText("Danh mục", { exact: true }), { target: { value: "pending" } });
  fireEvent.click(screen.getByRole("button", { name: "Xem lịch sử thay đổi" }));
  const history = within(await screen.findByRole("region", { name: "Lịch sử thay đổi" }));
  expect(history.getByText("reviewer-id")).toBeInTheDocument();
  expect(history.getByText("Cần bổ sung nguồn")).toBeInTheDocument();
  expect(history.getByText("request-id")).toBeInTheDocument();
  expect(history.getByText("4", { exact: true })).toBeInTheDocument();
  expect(history.getAllByText(/Chưa được ghi \(dữ liệu cũ\)/)).toHaveLength(4);
  expect(history.queryByText(/Invalid Date/)).not.toBeInTheDocument();
});

it("renders the skill audit actor and metadata from the AI history shape", async () => {
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  await selectSkill();
  vi.mocked(apiRequest).mockResolvedValueOnce([{ id: 1, actorId: "skill-reviewer", action: "APPROVE", version: 8,
    createdAt: "2026-10-02T01:00:00Z", reason: "Đã kiểm tra", correlationId: "skill-request",
    redacted: true,
    before: skill, after: { ...skill, status: "ACTIVE", type: "framework", category: "backend", aliases: [{ value: "NFX" }] } }]);
  fireEvent.click(screen.getByRole("button", { name: "Xem lịch sử thay đổi" }));
  const history = within(await screen.findByRole("region", { name: "Lịch sử thay đổi" }));
  expect(history.getByText("skill-reviewer")).toBeInTheDocument();
  expect(history.getByText("skill-request")).toBeInTheDocument();
  expect(history.getByText("Tên gọi khác: NFX")).toBeInTheDocument();
  expect(history.getByText("Loại kỹ năng: Framework · Nhóm: Backend")).toBeInTheDocument();
  expect(history.getByText("Thông tin liên hệ đã được che trong bản ghi này.")).toBeInTheDocument();
});

it("opens a queued skill using fresh catalog metadata and preserves the draft when selecting it again", async () => {
  let catalogReads = 0;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method) return {};
    if (path === "/api/v2/dashboard/catalog") return [];
    if (path === "/api/v2/taxonomy/skills") {
      catalogReads += 1;
      return catalogReads === 1 ? catalog : { ...catalog, version: 5, skills: [
        { ...skill, canonicalName: "FreshDefinition", type: "framework", category: "backend" }, ...catalog.skills.slice(1)
      ] };
    }
    if (path.includes("pending-skills?")) return { catalogVersion: 5, taxonomyVersion: "1.0.1", page: 0, size: 20,
      totalElements: 1, items: [{ skillId: "skill", name: "Queued proposal", status: "PENDING", type: "framework", category: "backend",
        occurrenceCount: 1, sourceCount: 1, firstSeen: null, lastSeen: null }] };
    return emptyLedger(path);
  });
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Kỹ năng / tên gọi khác" }));
  fireEvent.click(await screen.findByRole("button", { name: "Queued proposal" }));
  await waitFor(() => expect(screen.getByLabelText("Tên", { exact: true })).toHaveValue("FreshDefinition"));
  expect(screen.getByLabelText("Loại kỹ năng")).toHaveValue("framework");
  reason("Giữ lý do đang soạn");
  fireEvent.click(await screen.findByRole("button", { name: "Queued proposal" }));
  expect(screen.getByLabelText("Lý do thay đổi")).toHaveValue("Giữ lý do đang soạn");
  expect(catalogReads).toBe(2);
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  await waitFor(() => expect(mutationBody()).toMatchObject({ version: 5, action: "APPROVE", name: "FreshDefinition",
    type: "framework", category: "backend", reason: "Giữ lý do đang soạn" }));
});

it("requires clean replacement of masked skill values while retaining reason-only review actions", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method) return {};
    const ledger = emptyLedger(path); if (ledger) return ledger;
    if (path === "/api/v2/dashboard/catalog") return [];
    return { ...catalog, skills: [{ ...skill, canonicalName: "Legacy ████", aliases: [{ value: "████" }], redacted: true }] };
  });
  render(<AdminWorkspace session={session} onLogout={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Kỹ năng / tên gọi khác" }));
  await screen.findByRole("option", { name: "Legacy ████ · PENDING" });
  fireEvent.change(screen.getByLabelText("Danh mục", { exact: true }), { target: { value: "skill" } });
  expect(screen.getByText(/Tên hoặc tên gọi khác có thông tin liên hệ đã được che/)).toBeInTheDocument();
  reason("Cần kiểm tra tên kỹ năng");
  fireEvent.click(screen.getByRole("button", { name: "Duyệt" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Thay nội dung đã che");
  expect(mutationBody()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tạm hoãn" }));
  await waitFor(() => expect(mutationBody()).toMatchObject({ action: "DEFER", reason: "Cần kiểm tra tên kỹ năng" }));
  expect(mutationBody()).not.toHaveProperty("name");
  expect(mutationBody()).not.toHaveProperty("aliases");
});
