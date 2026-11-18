import { render, screen, waitFor, within } from "@testing-library/react";
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
    window.history.replaceState(null, "", "/candidate/notifications");
  });

  it("marks unread candidate notification as read and navigates directly to the target on click", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            unreadCount: 1,
            totalCount: 1,
            applicationCount: 1,
            hasMore: false,
            items: [
              {
                notificationId: "22222222-2222-2222-2222-222222222222",
                type: "APPLICATION_STATUS_CHANGED",
                title: "Trạng thái ứng tuyển đã thay đổi",
                message: "Hồ sơ hiện ở trạng thái SHORTLISTED.",
                linkUrl: "/candidate/applications?application=57",
                readAt: null,
                createdAt: "2026-08-25T10:00:00Z",
                version: 0
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    render(<NotificationCenter session={session} onLogout={vi.fn()} />);

    const title = await screen.findByText("Trạng thái ứng tuyển đã thay đổi");
    expect(screen.getByText("1 chưa đọc")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đã đọc" })).not.toBeInTheDocument();

    await user.click(title);

    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe("/candidate/applications?application=57");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/v2/notifications/22222222-2222-2222-2222-222222222222/read?version=0"
    );
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer access-token");
  });

  it("filters notifications by tabs: all, unread, and applications (including withdrawals)", async () => {
    const items = [
      {
        notificationId: "notif-1",
        type: "APPLICATION_WITHDRAWN",
        title: "Ứng viên đã rút hồ sơ",
        message: "Một hồ sơ ứng tuyển đã được rút",
        linkUrl: "/recruiter/jobs/5?application=11",
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
        createdAt: "2026-08-25T11:00:00Z",
        version: 1
      }
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 1, items }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 1, items: [items[0]] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    const user = userEvent.setup();
    render(<NotificationCenter session={session} onLogout={vi.fn()} />);

    expect(await screen.findByText("Ứng viên đã rút hồ sơ")).toBeInTheDocument();
    expect(screen.getByText("Đã có kết quả đối sánh")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Chưa đọc \(1\)/i }));
    expect(await screen.findByText("Ứng viên đã rút hồ sơ")).toBeInTheDocument();
    expect(screen.queryByText("Đã có kết quả đối sánh")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/notifications?limit=30&unreadOnly=true");

    await user.click(screen.getByRole("tab", { name: /Hồ sơ ứng tuyển \(1\)/i }));
    expect(screen.getByText("Ứng viên đã rút hồ sơ")).toBeInTheDocument();
    expect(screen.queryByText("Đã có kết quả đối sánh")).not.toBeInTheDocument();
  });

  it("displays true global counts above 30, loads more pages, and filters applications on server", async () => {
    const firstPage = Array.from({ length: 30 }, (_, index) => ({
      notificationId: `notif-${index + 1}`,
      type: index % 2 === 0 ? "APPLICATION_SUBMITTED" : "MATCHING_COMPLETED",
      title: `Thông báo #${index + 1}`,
      message: "Nội dung thông báo",
      linkUrl: `/candidate/applications?application=${index + 1}`,
      readAt: null,
      createdAt: "2026-11-18T10:00:00Z",
      version: 0
    }));
    const secondPageItem = {
      notificationId: "notif-31",
      type: "APPLICATION_SUBMITTED",
      title: "Thông báo #31",
      message: "Trang tiếp theo",
      linkUrl: "/candidate/applications?application=31",
      readAt: null,
      createdAt: "2026-11-18T09:00:00Z",
      version: 0
    };

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            unreadCount: 58,
            totalCount: 72,
            applicationCount: 41,
            hasMore: true,
            items: firstPage
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            unreadCount: 58,
            totalCount: 72,
            applicationCount: 41,
            hasMore: true,
            items: [secondPageItem]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            unreadCount: 58,
            totalCount: 72,
            applicationCount: 41,
            hasMore: true,
            items: [secondPageItem]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const user = userEvent.setup();
    render(<NotificationCenter session={session} onLogout={vi.fn()} />);

    expect(await screen.findByRole("tab", { name: "Tất cả (72)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Chưa đọc (58)" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Hồ sơ ứng tuyển (41)" })).toBeInTheDocument();
    expect(screen.getByText("Đang hiển thị 30 / 72 thông báo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xem thêm thông báo" }));
    expect(await screen.findByText("Thông báo #31")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/notifications?limit=30&offset=30");

    await user.click(screen.getByRole("tab", { name: "Hồ sơ ứng tuyển (41)" }));
    expect(await screen.findByText("Thông báo #31")).toBeInTheDocument();
    expect(fetchMock.mock.calls[2][0]).toBe("/api/v2/notifications?limit=30&applicationsOnly=true");
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

  it("navigates recruiter directly to job application pipeline and company team tab and marks read", async () => {
    window.history.replaceState(null, "", "/recruiter/notifications");
    const recruiterSession: AuthSession = { ...session, roles: ["RECRUITER"] };
    const items = [
      {
        notificationId: "notif-rec",
        type: "APPLICATION_SUBMITTED",
        title: "Có hồ sơ ứng tuyển mới",
        message: "Một ứng viên vừa nộp hồ sơ vào tin tuyển dụng của công ty.",
        linkUrl: "/recruiter/jobs/12?application=88",
        readAt: null,
        createdAt: "2026-11-18T10:00:00Z",
        version: 0
      },
      {
        notificationId: "notif-team",
        type: "COMPANY_INVITATION_ACCEPTED",
        title: "Lời mời công ty đã được chấp nhận",
        message: "teammate@company.test đã tham gia công ty.",
        linkUrl: "/recruiter/company",
        readAt: "2026-11-18T09:00:00Z",
        createdAt: "2026-11-18T09:00:00Z",
        version: 1
      }
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/v2/notifications?limit=30") {
        return new Response(JSON.stringify({ unreadCount: 1, totalCount: 2, applicationCount: 1, items }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "/api/v2/notifications/notif-rec/read?version=0") {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 404 });
    });

    const user = userEvent.setup();
    render(<NotificationCenter session={recruiterSession} onLogout={vi.fn()} />);

    await user.click(await screen.findByText("Có hồ sơ ứng tuyển mới"));
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe("/recruiter/jobs/12?application=88");
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/v2/notifications/notif-rec/read?version=0")).toBe(true);

    await user.click(screen.getByText("Lời mời công ty đã được chấp nhận"));
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe("/recruiter/company?tab=team");
    });
  });

  it("falls back to detail modal and marks read when a notification has no direct route", async () => {
    const items = [
      {
        notificationId: "notif-system",
        type: "SYSTEM_NOTICE",
        title: "Thông báo hệ thống",
        message: "Bảo trì định kỳ lúc 02:00.",
        linkUrl: "/",
        readAt: null,
        createdAt: "2026-11-18T10:00:00Z",
        version: 0
      }
    ];

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ unreadCount: 1, totalCount: 1, applicationCount: 0, items }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const user = userEvent.setup();
    render(<NotificationCenter session={session} onLogout={vi.fn()} />);

    await user.click(await screen.findByText("Thông báo hệ thống"));
    const dialog = await screen.findByRole("dialog", { name: "Thông báo hệ thống" });
    expect(within(dialog).getByText("Bảo trì định kỳ lúc 02:00.")).toBeInTheDocument();
    expect(await screen.findByText("0 chưa đọc")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/notifications/notif-system/read?version=0");
  });
});
