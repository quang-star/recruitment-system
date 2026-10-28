import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RecruiterApplicationsPanel } from "./RecruiterApplicationsPanel";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn()
}));

it("uses global server ranking, resets the page on filters and displays whole-star ratings", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.includes("/match")) return { finalScore: 87, status: "COMPLETED", qualityFlags: [], explanation: { components: [], claims: [] } };
    const params = new URL(path, "http://test").searchParams;
    const page = Number(params.get("page"));
    return { items: [{ applicationId: `app-${page}`, candidateUserId: `candidate-${page}`, status: "SUBMITTED",
      appliedAt: "2026-09-29T00:00:00Z", version: 0 }], total: 21, page, size: 10 };
  });
  const session = { accessToken: "fixture", roles: ["RECRUITER"] } as AuthSession;
  render(<RecruiterApplicationsPanel session={session} jobId="job" canTransition={false} />);
  expect(await within(screen.getByRole("table", { name: "Danh sách ứng viên" })).findByRole("img", { name: "Mức độ phù hợp: 5/5 sao · Phù hợp rất cao" })).toBeInTheDocument();
  expect(screen.getByText("21 hồ sơ")).toBeInTheDocument();
  const paging = screen.getByRole("navigation", { name: "Phân trang ứng viên" });
  fireEvent.click(within(paging).getByRole("button", { name: "Trang sau" }));
  await waitFor(() => expect(paging).toHaveTextContent("Trang 2/3"));
  fireEvent.change(screen.getByLabelText("Sắp xếp"), { target: { value: "score" } });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
    expect.stringMatching(/sort=score.*page=0&size=10/), expect.anything()));
  fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "REJECTED" } });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
    expect.stringMatching(/status=REJECTED.*page=0&size=10/), expect.anything()));
});

it("does not display a zero score for insufficient data and opens only the selected detail", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith("/match")
    ? { finalScore: 0, status: "INSUFFICIENT_DATA", qualityFlags: [], explanation: { components: [], claims: [] } }
    : { items: ["first", "second"].map((id) => ({ applicationId: id, candidateUserId: id, coverLetter: `Letter ${id}`,
      status: "SUBMITTED", appliedAt: "2026-10-01T00:00:00Z", version: 0 })), total: 2, page: 0, size: 10 });
  render(<RecruiterApplicationsPanel session={{ accessToken: "fixture" } as AuthSession} jobId="job" canTransition={false} />);
  const table = screen.getByRole("table", { name: "Danh sách ứng viên" });
  expect(await within(table).findAllByText("Chưa đủ dữ liệu")).toHaveLength(2);
  expect(screen.queryByText("0.0/100")).not.toBeInTheDocument();
  expect(within(table).queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByText("Letter second")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ứng viên second…" }));
  expect(screen.getByText("Letter second")).toBeInTheDocument();
  expect(screen.queryByText("Letter first")).not.toBeInTheDocument();
});

it("distinguishes a failed match request from a pending result and can retry", async () => {
  let fail = true;
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.endsWith("/match")) {
      if (fail) throw new ApiClientError(503, { code: "UNAVAILABLE", message: "Unavailable" } as never);
      return { finalScore: 65, status: "DEGRADED", qualityFlags: [], explanation: { components: [], claims: [] } };
    }
    return { items: [{ applicationId: "app", candidateUserId: "candidate", status: "SUBMITTED", appliedAt: "2026-10-01T00:00:00Z", version: 0 }], total: 1, page: 0, size: 10 };
  });
  render(<RecruiterApplicationsPanel session={{ accessToken: "fixture" } as AuthSession} jobId="job" canTransition={false} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được kết quả đối chiếu");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Thử lại điểm" }));
  expect(await within(screen.getByRole("table")).findByRole("img", { name: "Mức độ phù hợp: 4/5 sao · Phù hợp cao" })).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getByText("Cần kiểm tra thêm")).toBeInTheDocument();
});

it("does not request AI scores for manual industries or revoked CV access", async () => {
  vi.mocked(apiRequest).mockClear();
  vi.mocked(apiRequest).mockImplementation(async () => ({ items: [
    { applicationId: "manual", candidateUserId: "manual", matchingSupported: false, status: "SUBMITTED", appliedAt: "2026-10-01T00:00:00Z", version: 0 },
    { applicationId: "revoked", candidateUserId: "revoked", cvAccessGranted: false, status: "SUBMITTED", appliedAt: "2026-10-01T00:00:00Z", version: 0 },
  ], total: 2, page: 0, size: 10 }));
  render(<RecruiterApplicationsPanel session={{ accessToken: "fixture" } as AuthSession} jobId="job" canTransition={false} />);
  expect(await within(screen.getByRole("table")).findByText("Xem xét thủ công")).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getByText("Đã thu hồi quyền xem")).toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.endsWith("/match"))).toBe(false);
});

it("switches to kanban board view, displays stages, and supports quick card stage transitions", async () => {
  vi.mocked(apiRequest).mockClear();
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path.includes("/status") && options?.method === "PATCH") {
      return {
        applicationId: "app-kanban",
        candidateUserId: "cand-kanban",
        status: "UNDER_REVIEW",
        appliedAt: "2026-10-01T00:00:00Z",
        version: 1
      };
    }
    if (path.endsWith("/match")) {
      return { finalScore: 92, status: "COMPLETED", qualityFlags: [], explanation: { components: [], claims: [] } };
    }
    return {
      items: [{
        applicationId: "app-kanban",
        candidateUserId: "cand-kanban",
        coverLetter: "Tôi muốn ứng tuyển vị trí này",
        status: "SUBMITTED",
        appliedAt: "2026-10-01T00:00:00Z",
        version: 0
      }],
      total: 1,
      page: 0,
      size: 10
    };
  });

  render(<RecruiterApplicationsPanel session={{ accessToken: "fixture" } as AuthSession} jobId="job-1" canTransition={true} />);

  // Switch to Kanban board
  fireEvent.click(screen.getByRole("button", { name: "📊 Bảng Kanban" }));

  // Verify Kanban region and stages
  const kanban = screen.getByRole("region", { name: "Bảng Kanban tuyển dụng" });
  expect(kanban).toBeInTheDocument();
  expect(within(kanban).getByText("Mới ứng tuyển")).toBeInTheDocument();
  expect(within(kanban).getByText("Đang xem xét")).toBeInTheDocument();
  expect(within(kanban).getByText("Danh sách rút gọn")).toBeInTheDocument();
  expect(within(kanban).getByText("Đã từ chối")).toBeInTheDocument();

  // Verify candidate card in Mới ứng tuyển
  expect(await within(kanban).findByText(/Ứng viên cand-kan/)).toBeInTheDocument();
  expect(await within(kanban).findByRole("img", { name: "Mức độ phù hợp: 5/5 sao · Phù hợp rất cao" })).toBeInTheDocument();

  // Click quick transition button ➡️ Xem xét
  const transitionBtn = within(kanban).getByRole("button", { name: /Xem xét/i });
  fireEvent.click(transitionBtn);

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v2/recruiter/applications/app-kanban/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "UNDER_REVIEW", reason: null, version: 0 })
      })
    );
  });
});
