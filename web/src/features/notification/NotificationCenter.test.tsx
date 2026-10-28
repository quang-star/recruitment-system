import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { NotificationCenter } from "./NotificationCenter";
import { AuthSession } from "../../shared/auth/session";

const session: AuthSession = {
  userId: "11111111-1111-1111-1111-111111111111",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2030-01-02T00:00:00Z",
  roles: ["CANDIDATE"]
};

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the unread feed and marks one versioned notification as read", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ unreadCount: 1, items: [{
        notificationId: "22222222-2222-2222-2222-222222222222", type: "APPLICATION_STATUS_CHANGED",
        title: "Trạng thái ứng tuyển đã thay đổi", message: "Hồ sơ hiện ở trạng thái SHORTLISTED.", linkUrl: "/",
        readAt: null, createdAt: "2026-08-25T10:00:00Z", version: 0
      }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    render(<NotificationCenter session={session} onLogout={vi.fn()} />);

    expect(await screen.findByText("Trạng thái ứng tuyển đã thay đổi")).toBeInTheDocument();
    expect(screen.getByText("1 chưa đọc")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Đã đọc" }));

    expect(await screen.findByText("0 chưa đọc")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/notifications/22222222-2222-2222-2222-222222222222/read?version=0");
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("filters notifications by tabs: all, unread, and applications", async () => {
    const items = [
      {
        notificationId: "notif-1",
        type: "APPLICATION_STATUS_CHANGED",
        title: "Hồ sơ được cập nhật",
        message: "Bạn đã vào vòng phỏng vấn",
        linkUrl: "/applications/app-1",
        readAt: null,
        createdAt: "2026-08-25T10:00:00Z",
        version: 0
      },
      {
        notificationId: "notif-2",
        type: "MATCHING_COMPLETED",
        title: "Đã có kết quả đối sánh",
        message: "Mở hồ sơ để xem kết quả",
        linkUrl: "/",
        readAt: "2026-08-25T11:00:00Z",
        version: 1
      }
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ unreadCount: 1, items }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const user = userEvent.setup();
    render(<NotificationCenter session={session} onLogout={vi.fn()} />);

    expect(await screen.findByText("Hồ sơ được cập nhật")).toBeInTheDocument();
    expect(screen.getByText("Đã có kết quả đối sánh")).toBeInTheDocument();

    // Switch to "Chưa đọc" tab
    await user.click(screen.getByRole("tab", { name: /Chưa đọc \(1\)/i }));
    expect(screen.getByText("Hồ sơ được cập nhật")).toBeInTheDocument();
    expect(screen.queryByText("Đã có kết quả đối sánh")).not.toBeInTheDocument();

    // Switch to "Hồ sơ ứng tuyển" tab
    await user.click(screen.getByRole("tab", { name: /Hồ sơ ứng tuyển \(1\)/i }));
    expect(screen.getByText("Hồ sơ được cập nhật")).toBeInTheDocument();
    expect(screen.queryByText("Đã có kết quả đối sánh")).not.toBeInTheDocument();
    expect(screen.getByText("Xem chi tiết →")).toBeInTheDocument();
  });

  it("supports marking all notifications as read", async () => {
    const items = [
      {
        notificationId: "notif-1",
        type: "APPLICATION_SUBMITTED",
        title: "Có hồ sơ mới",
        message: "Ứng viên Nguyễn Văn A đã nộp hồ sơ",
        linkUrl: null,
        readAt: null,
        createdAt: "2026-08-25T10:00:00Z",
        version: 0
      }
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ unreadCount: 1, items }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const user = userEvent.setup();
    render(<NotificationCenter session={session} onLogout={vi.fn()} />);

    expect(await screen.findByText("Có hồ sơ mới")).toBeInTheDocument();
    const markAllBtn = screen.getByRole("button", { name: /Đánh dấu tất cả đã đọc/i });
    expect(markAllBtn).toBeEnabled();

    await user.click(markAllBtn);

    expect(await screen.findByText("0 chưa đọc")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/notifications/read-all");
    expect(markAllBtn).toBeDisabled();
  });
});
