import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NotificationCenter } from "./NotificationCenter";
import { AuthSession } from "../../shared/auth/session";

const session: AuthSession = {
  userId: "11111111-1111-1111-1111-111111111111", accessToken: "access-token", refreshToken: "refresh-token",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z", refreshTokenExpiresAt: "2030-01-02T00:00:00Z", roles: ["CANDIDATE"]
};

describe("NotificationCenter", () => {
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
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/notifications/22222222-2222-2222-2222-222222222222/read?version=0");
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer access-token");
  });
});
