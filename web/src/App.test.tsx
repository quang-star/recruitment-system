import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { apiRequest } from "./shared/api/client";
import { AuthSession, clearSession, loadSession, saveSession } from "./shared/auth/session";

vi.mock("./features/candidate/CandidateProfilePage", () => ({ CandidateProfilePage: ({ onLogout }: { onLogout: () => void }) =>
  <section><h1>Candidate workspace</h1><input aria-label="Unsaved draft" /><button onClick={onLogout}>Logout</button></section> }));
vi.mock("./features/public/PublicHomePage", () => ({ PublicHomePage: () => <h1>Public home</h1> }));
vi.mock("./features/recruiter/RecruiterWorkspace", () => ({ RecruiterWorkspace: () => <h1>Recruiter workspace</h1> }));

const session: AuthSession = { userId: "user-1", accessToken: "old-access", refreshToken: "old-refresh",
  accessTokenExpiresAt: "2026-09-30T00:00:00Z", refreshTokenExpiresAt: "2026-12-01T00:00:00Z", roles: ["CANDIDATE"] };
const me = { userId: "user-1", roles: ["CANDIDATE"], status: "ACTIVE", emailVerified: true };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { clearSession(); saveSession(session); });
afterEach(() => { vi.restoreAllMocks(); clearSession(); });

it("keeps a stored session and blocks the workspace until a failed verification is retried successfully", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Network unavailable"));
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Phiên được giữ lại");
  expect(loadSession()).toEqual(session);
  expect(screen.queryByText("Candidate workspace")).not.toBeInTheDocument();
  expect(screen.queryByText("Public home")).not.toBeInTheDocument();
  fetchMock.mockResolvedValueOnce(json(me));
  fireEvent.click(screen.getByRole("button", { name: "Thử xác minh lại" }));
  expect(await screen.findByText("Candidate workspace")).toBeInTheDocument();
});

it("keeps an unsaved draft mounted while refresh rotates the token", async () => {
  const next = { ...session, accessToken: "new-access", refreshToken: "new-refresh" };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/auth/me")) return json(me);
    if (String(url).endsWith("/auth/refresh")) return json(next);
    return new Headers(init?.headers).get("Authorization") === "Bearer new-access" ? json({ ok: true })
      : json({ code: "HTTP_ERROR", message: "Expired" }, 401);
  });
  render(<App />);
  const input = await screen.findByLabelText("Unsaved draft");
  fireEvent.change(input, { target: { value: "Still editing" } });
  await act(async () => { await apiRequest("/api/v2/operation", { accessToken: session.accessToken }); });
  expect(screen.getByLabelText("Unsaved draft")).toBe(input);
  expect(input).toHaveValue("Still editing");
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/me"))).toHaveLength(1);
});

it("returns to login when startup refresh confirms that the stored session is invalid", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith("/auth/refresh") ? json({ code: "INVALID_REFRESH_TOKEN", message: "Expired" }, 401)
      : json({ code: "HTTP_ERROR", message: "Expired" }, 401));
  render(<App />);
  expect(await screen.findByText("Public home")).toBeInTheDocument();
  expect(loadSession()).toBeNull();
});

it("clears local state immediately when the user logs out even if the server is unavailable", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/auth/me")) return json(me);
    throw new TypeError("Network unavailable");
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Logout" }));
  expect(await screen.findByText("Public home")).toBeInTheDocument();
  expect(loadSession()).toBeNull();
});
