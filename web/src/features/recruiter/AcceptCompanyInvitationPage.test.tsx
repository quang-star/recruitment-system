import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptCompanyInvitationPage } from "./AcceptCompanyInvitationPage";
import { AuthSession, clearSession, saveSession } from "../../shared/auth/session";

const session: AuthSession = {
  userId: "11111111-1111-1111-1111-111111111111",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2030-01-02T00:00:00Z",
  roles: ["RECRUITER"]
};

describe("AcceptCompanyInvitationPage", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    clearSession();
    vi.restoreAllMocks();
  });

  it("accepts the URL token with the authenticated recruiter session", async () => {
    const token = "b".repeat(64);
    window.history.replaceState({}, "", `/accept-invitation?token=${token}`);
    saveSession(session);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ companyId: "42", role: "RECRUITER", status: "ACTIVE" }))
      .mockResolvedValueOnce(Response.json({ ...session, accessToken: "new-access", refreshToken: "new-refresh" }));
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <AcceptCompanyInvitationPage session={session} onLogout={vi.fn()} isNarrowViewport={false} />
      </BrowserRouter>
    );

    await user.click(screen.getByRole("button", { name: "Chấp nhận lời mời" }));

    expect(await screen.findByText(/đã tham gia công ty/)).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/v2/auth/company-invitations/accept");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
    expect(JSON.parse(String(init?.body))).toEqual({ token });
    expect(await screen.findByRole("link", { name: "Mở không gian tuyển dụng" })).toHaveAttribute("href", "/recruiter");
  });
});
