import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptCompanyInvitationPage } from "./AcceptCompanyInvitationPage";
import { AuthSession } from "../../shared/auth/session";

const session: AuthSession = {
  userId: "11111111-1111-1111-1111-111111111111",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  accessTokenExpiresAt: "2030-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2030-01-02T00:00:00Z",
  roles: ["RECRUITER"]
};

describe("AcceptCompanyInvitationPage", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("accepts the URL token with the authenticated recruiter session", async () => {
    const token = "b".repeat(64);
    window.history.replaceState({}, "", `/accept-invitation?token=${token}`);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      memberId: "member-1", companyId: "company-1", userId: session.userId,
      role: "RECRUITER", status: "ACTIVE", joinedAt: "2026-08-25T10:00:00Z", version: 0
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const user = userEvent.setup();
    render(<AcceptCompanyInvitationPage session={session} onLogout={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Chấp nhận lời mời" }));

    expect(await screen.findByText(/đã tham gia công ty/)).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/v1/companies/invitations/accept");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer access-token");
    expect(JSON.parse(String(init?.body))).toEqual({ token });
  });
});
