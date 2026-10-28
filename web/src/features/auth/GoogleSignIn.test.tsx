import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadGoogleIdentity, type GoogleIdentityApi } from "../../shared/auth/google";
import { loadSession } from "../../shared/auth/session";
import { AccountSecurityPanel } from "./AccountSecurityPanel";
import { GoogleSignIn } from "./GoogleSignIn";
import { LoginPage } from "./LoginPage";

vi.mock("../../shared/auth/google", () => ({ loadGoogleIdentity: vi.fn() }));

const session = { userId: "user-id", accessToken: "app-access", refreshToken: "app-refresh",
  accessTokenExpiresAt: "2026-10-15T12:00:00Z", refreshTokenExpiresAt: "2026-11-15T12:00:00Z", roles: ["CANDIDATE"] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let configuration: Parameters<GoogleIdentityApi["initialize"]>[0];
const initialize = vi.fn((options: typeof configuration) => { configuration = options; });
const renderButton = vi.fn((element: HTMLElement) => {
  const button = document.createElement("button");
  button.textContent = "Google popup";
  button.onclick = () => configuration.callback({ credential: "google-id-token" });
  element.appendChild(button);
});

beforeEach(() => {
  initialize.mockClear();
  renderButton.mockClear();
  vi.mocked(loadGoogleIdentity).mockReset().mockResolvedValue({ initialize, renderButton });
});

function setupFetch(failure = false) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/google/config")) return json({ clientId: "test.apps.googleusercontent.com" });
    if (String(url).endsWith("/google/challenge")) return json({ nonce: "server-nonce", expiresAt: "2026-10-15T12:00:00Z" });
    if (String(url).endsWith("/google/login")) return failure
      ? json({ code: "GOOGLE_LINK_REQUIRED", message: "Hãy đăng nhập tài khoản hiện có rồi liên kết Google." }, 409)
      : json(session);
    if (String(url).endsWith("/google/link")) return new Response(null, { status: 204 });
    if (String(url).endsWith("/auth/sessions")) return json([]);
    throw new Error(`Unexpected test route: ${String(url)}`);
  });
}

describe("Google sign-in", () => {
  it("uses server client ID and nonce, exchanges the Google credential and saves the app session", async () => {
    const fetchMock = setupFetch();
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(session));
    expect(configuration).toMatchObject({ client_id: "test.apps.googleusercontent.com", nonce: "server-nonce", ux_mode: "popup", auto_select: false });
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/google/login"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ credential: "google-id-token", nonce: "server-nonce", accountType: "CANDIDATE" });
    expect(loadSession()).toEqual(session);
    expect(sessionStorage.getItem("smart-recruitment.session")).not.toContain("google-id-token");
  });

  it("uses the selected registration role without submitting email/password", async () => {
    const fetchMock = setupFetch();
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} initialMode="register" />);
    fireEvent.change(screen.getByLabelText("Loại tài khoản"), { target: { value: "RECRUITER" } });
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/google/login"));
    expect(JSON.parse(String(call?.[1]?.body)).accountType).toBe("RECRUITER");
  });

  it("shows account linking instructions without accepting a failed login", async () => {
    setupFetch(true);
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("liên kết Google");
    expect(loadSession()).toBeNull();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Thử lại Google" })).toBeEnabled();
  });

  it("links Google with the current application bearer token", async () => {
    const fetchMock = setupFetch();
    render(<AccountSecurityPanel session={session} onLogout={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    expect(await screen.findByText(/Đã liên kết Google/)).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/google/link"));
    expect(new Headers(call?.[1]?.headers).get("Authorization")).toBe("Bearer app-access");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ credential: "google-id-token", nonce: "server-nonce" });
  });

  it("hides the button when unconfigured and never loads the external script", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ clientId: "" }));
    render(<GoogleSignIn onCredential={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(loadGoogleIdentity).not.toHaveBeenCalled();
    expect(screen.queryByText(/Hoặc tiếp tục/)).not.toBeInTheDocument();
  });

  it("recovers from a blocked Google script and fetches a new challenge on retry", async () => {
    setupFetch();
    vi.mocked(loadGoogleIdentity).mockRejectedValueOnce(new Error("Google script blocked"));
    render(<GoogleSignIn onCredential={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Google script blocked");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại Google" }));
    expect(await screen.findByRole("button", { name: "Google popup" })).toBeInTheDocument();
  });

  it("ignores credentials from an unmounted page", async () => {
    setupFetch();
    const onCredential = vi.fn();
    const view = render(<GoogleSignIn onCredential={onCredential} />);
    await screen.findByRole("button", { name: "Google popup" });
    const oldCallback = configuration.callback;
    view.unmount();
    oldCallback({ credential: "old-token" });
    expect(onCredential).not.toHaveBeenCalled();
  });
});
