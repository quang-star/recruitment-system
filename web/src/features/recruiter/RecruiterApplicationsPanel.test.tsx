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
  const table = await screen.findByRole("table", { name: "Danh sách ứng viên" });
  expect(await within(table).findByRole("img", { name: "Mức độ phù hợp: 5/5 sao · Phù hợp rất cao" })).toBeInTheDocument();
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
  const table = await screen.findByRole("table", { name: "Danh sách ứng viên" });
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
  const table = await screen.findByRole("table");
  expect(await within(table).findByRole("img", { name: "Mức độ phù hợp: 4/5 sao · Phù hợp cao" })).toBeInTheDocument();
  expect(within(table).getByText("Chưa đủ căn cứ chấm điểm · Cần xem thủ công")).toBeInTheDocument();
});

it("does not request AI scores for manual industries or revoked CV access", async () => {
  vi.mocked(apiRequest).mockClear();
  vi.mocked(apiRequest).mockImplementation(async () => ({ items: [
    { applicationId: "manual", candidateUserId: "manual", matchingSupported: false, status: "SUBMITTED", appliedAt: "2026-10-01T00:00:00Z", version: 0 },
    { applicationId: "revoked", candidateUserId: "revoked", cvAccessGranted: false, status: "SUBMITTED", appliedAt: "2026-10-01T00:00:00Z", version: 0 },
  ], total: 2, page: 0, size: 10 }));
  render(<RecruiterApplicationsPanel session={{ accessToken: "fixture" } as AuthSession} jobId="job" canTransition={false} />);
  const table = await screen.findByRole("table");
  expect(within(table).getByText("Xem xét thủ công")).toBeInTheDocument();
  expect(within(table).getByText("Đã thu hồi quyền xem")).toBeInTheDocument();
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
      items: [
        {
          applicationId: "app-kanban",
          candidateUserId: "cand-kanban",
          coverLetter: "Tôi muốn ứng tuyển vị trí này",
          status: "SUBMITTED",
          appliedAt: "2026-10-01T00:00:00Z",
          version: 0
        },
        {
          applicationId: "app-shortlisted",
          candidateUserId: "cand-shortlisted",
          candidateName: "Ứng viên đã qua vòng CV",
          status: "SHORTLISTED",
          appliedAt: "2026-10-01T00:00:00Z",
          version: 2
        },
        {
          applicationId: "app-hired",
          candidateUserId: "cand-hired",
          candidateName: "Ứng viên từ dữ liệu cũ",
          status: "HIRED",
          appliedAt: "2026-10-01T00:00:00Z",
          version: 5
        }
      ],
      total: 3,
      page: 0,
      size: 10
    };
  });

  render(<RecruiterApplicationsPanel session={{ accessToken: "fixture" } as AuthSession} jobId="job-1" canTransition={true} />);

  // Switch to Kanban board
  fireEvent.click(screen.getByRole("button", { name: "Bảng Kanban" }));

  // Verify Kanban region and stages
  const kanban = await screen.findByRole("region", { name: "Bảng Kanban tuyển dụng" });
  expect(within(kanban).getByText("Mới ứng tuyển")).toBeInTheDocument();
  expect(within(kanban).getByText("Đang xem xét")).toBeInTheDocument();
  expect(within(kanban).getByText("Danh sách rút gọn")).toBeInTheDocument();
  expect(within(kanban).getByText("Đã từ chối")).toBeInTheDocument();
  expect(within(kanban).getAllByRole("heading")).toHaveLength(4);
  expect(within(kanban).getByText("Ứng viên từ dữ liệu cũ").closest("[data-stage]")).toHaveAttribute("data-stage", "SHORTLISTED");

  fireEvent.click(within(kanban).getByText("Ứng viên đã qua vòng CV"));
  expect(screen.queryByRole("button", { name: "Đang phỏng vấn" })).not.toBeInTheDocument();

  // Verify candidate card in Mới ứng tuyển
  expect(await within(kanban).findByText(/Ứng viên cand-kan/)).toBeInTheDocument();
  expect(await within(kanban).findAllByRole("img", { name: "Mức độ phù hợp: 5/5 sao · Phù hợp rất cao" })).toHaveLength(3);

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

it("clears the table status filter in Kanban so moved cards remain visible", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path.endsWith("/match")
    ? { finalScore: 50, status: "COMPLETED", qualityFlags: [], explanation: { components: [], claims: [] } }
    : { items: [], total: 0, page: 0, size: 10 });
  render(<RecruiterApplicationsPanel session={{ accessToken: "fixture" } as AuthSession} jobId="42" canTransition />);
  const status = screen.getByLabelText("Trạng thái");
  expect(within(status).queryByRole("option", { name: "Đang phỏng vấn" })).not.toBeInTheDocument();
  fireEvent.change(status, { target: { value: "SUBMITTED" } });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringMatching(/status=SUBMITTED/), expect.anything()));
  expect(await screen.findByText("Không có hồ sơ phù hợp bộ lọc hiện tại.")).toBeVisible();
  vi.mocked(apiRequest).mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Bảng Kanban" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringMatching(/jobId=42&sort=newest.*page=0&size=100/), expect.anything()));
  expect(screen.getByLabelText("Trạng thái")).toBeDisabled();
  expect(await screen.findByText("Chưa có hồ sơ ứng tuyển")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Bảng Kanban tuyển dụng" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Phân trang ứng viên" })).not.toBeInTheDocument();
  expect(screen.queryByText(/thang 1–5 sao/)).not.toBeInTheDocument();

  const search = screen.getByRole("textbox", { name: "Tìm hồ sơ" });
  fireEvent.change(search, { target: { value: "không khớp" } });
  fireEvent.click(await screen.findByRole("button", { name: "Xóa bộ lọc" }));
  expect(search).toHaveValue("");
  expect(await screen.findByText("Chưa có hồ sơ ứng tuyển")).toBeVisible();
});
