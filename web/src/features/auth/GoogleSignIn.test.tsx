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
    if (String(url).endsWith("/auth/me")) {
      return json({
        userId: session.userId,
        email: "candidate@example.com",
        status: "ACTIVE",
        emailVerified: true,
        roles: session.roles,
        hasPassword: true,
        googleLinked: false
      });
    }
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

  it("does not render the Google account linking section in AccountSecurityPanel", async () => {
    setupFetch();
    render(<AccountSecurityPanel session={session} onLogout={vi.fn()} />);
    await screen.findByRole("heading", { name: "Mật khẩu & phiên đăng nhập" });
    expect(screen.queryByRole("heading", { name: "Liên kết Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Google popup" })).not.toBeInTheDocument();
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

  it("bootstraps candidate displayName, avatarUrl, and contactEmail on first Google login without polluting sessionStorage", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/google/config")) return json({ clientId: "test.apps.googleusercontent.com" });
      if (target.endsWith("/google/challenge")) return json({ nonce: "server-nonce", expiresAt: "2026-10-15T12:00:00Z" });
      if (target.endsWith("/google/login")) {
        return json({
          ...session,
          newAccount: true,
          googleProfile: {
            displayName: "Nguyễn Văn An",
            avatarUrl: "https://lh3.googleusercontent.com/a/an",
            email: "an@example.com"
          }
        });
      }
      if (target.endsWith("/api/v2/candidates/me") && init?.method === "PUT") {
        return json({ displayName: "Nguyễn Văn An", avatarUrl: "https://lh3.googleusercontent.com/a/an", version: 0 });
      }
      throw new Error(`Unexpected test route: ${target}`);
    });
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(session));
    const putCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/api/v2/candidates/me") && init?.method === "PUT");
    expect(putCall).toBeDefined();
    expect(new Headers(putCall?.[1]?.headers).get("Authorization")).toBe("Bearer app-access");
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({
      displayName: "Nguyễn Văn An",
      avatarUrl: "https://lh3.googleusercontent.com/a/an",
      contactEmail: "an@example.com",
      visibility: "APPLICATION_ONLY",
      version: null
    });
    expect(loadSession()).toEqual(session);
  });

  it("never overwrites an existing candidate profile when returning via Google login", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/google/config")) return json({ clientId: "test.apps.googleusercontent.com" });
      if (target.endsWith("/google/challenge")) return json({ nonce: "server-nonce", expiresAt: "2026-10-15T12:00:00Z" });
      if (target.endsWith("/google/login")) {
        return json({
          ...session,
          newAccount: false,
          googleProfile: {
            displayName: "Google Name",
            avatarUrl: "https://lh3.googleusercontent.com/a/google",
            email: "an@example.com"
          }
        });
      }
      if (target.endsWith("/api/v2/candidates/me") && (!init?.method || init.method === "GET")) {
        return json({ displayName: "Custom Name", avatarUrl: null, version: 2 });
      }
      throw new Error(`Unexpected test route: ${target}`);
    });
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(session));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/api/v2/candidates/me") && init?.method === "PUT")).toBe(false);
  });

  it("bootstraps candidate profile on returning Google login if core profile is still missing (404)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/google/config")) return json({ clientId: "test.apps.googleusercontent.com" });
      if (target.endsWith("/google/challenge")) return json({ nonce: "server-nonce", expiresAt: "2026-10-15T12:00:00Z" });
      if (target.endsWith("/google/login")) {
        return json({
          ...session,
          newAccount: false,
          googleProfile: {
            displayName: "Google Recovery",
            avatarUrl: "https://lh3.googleusercontent.com/a/rec",
            email: "rec@example.com"
          }
        });
      }
      if (target.endsWith("/api/v2/candidates/me") && (!init?.method || init.method === "GET")) {
        return json({ code: "CANDIDATE_PROFILE_NOT_FOUND", message: "Candidate profile was not found" }, 404);
      }
      if (target.endsWith("/api/v2/candidates/me") && init?.method === "PUT") {
        return json({ displayName: "Google Recovery", version: 0 });
      }
      throw new Error(`Unexpected test route: ${target}`);
    });
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} />);
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(session));
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/api/v2/candidates/me") && init?.method === "PUT")).toBe(true);
  });

  it("bootstraps recruiter displayName when registering as RECRUITER via Google", async () => {
    const recruiterSession = { ...session, roles: ["RECRUITER"] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/google/config")) return json({ clientId: "test.apps.googleusercontent.com" });
      if (target.endsWith("/google/challenge")) return json({ nonce: "server-nonce", expiresAt: "2026-10-15T12:00:00Z" });
      if (target.endsWith("/google/login")) {
        return json({
          ...recruiterSession,
          newAccount: true,
          googleProfile: {
            displayName: "Lê Minh",
            avatarUrl: "https://lh3.googleusercontent.com/a/minh",
            email: "minh@company.com"
          }
        });
      }
      if (target.endsWith("/api/v2/recruiter/profile") && init?.method === "PUT") {
        return json({ displayName: "Lê Minh", version: 0 });
      }
      throw new Error(`Unexpected test route: ${target}`);
    });
    const onSuccess = vi.fn();
    render(<LoginPage onSuccess={onSuccess} initialMode="register" />);
    fireEvent.change(screen.getByLabelText("Loại tài khoản"), { target: { value: "RECRUITER" } });
    fireEvent.click(await screen.findByRole("button", { name: "Google popup" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(recruiterSession));
    const putCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/api/v2/recruiter/profile") && init?.method === "PUT");
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
      displayName: "Lê Minh",
      businessTitle: null,
      businessPhone: null
    });
  });

  it("hides the Google link button and current-password form for Google-only accounts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/auth/me")) {
        return json({
          userId: session.userId,
          email: "google-user@example.com",
          status: "ACTIVE",
          emailVerified: true,
          roles: session.roles,
          hasPassword: false,
          googleLinked: true
        });
      }
      if (target.endsWith("/auth/sessions")) return json([]);
      if (target.endsWith("/auth/forgot-password")) return json({ message: "sent" }, 202);
      throw new Error(`Unexpected test route: ${target}`);
    });
    render(<AccountSecurityPanel session={session} onLogout={vi.fn()} />);

    expect(await screen.findByText("Chưa đặt mật khẩu riêng")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Liên kết Google" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Google popup" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu hiện tại")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gửi liên kết tạo mật khẩu qua email" }));
    expect(await screen.findByText(/Đã gửi hướng dẫn tạo mật khẩu tới google-user@example\.com/)).toBeInTheDocument();
    const forgotCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/forgot-password"));
    expect(JSON.parse(String(forgotCall?.[1]?.body))).toEqual({ email: "google-user@example.com" });
  });

  it("marks the current session and logs out immediately when the current session is revoked", async () => {
    const onLogout = vi.fn();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/auth/me")) {
        return json({
          userId: session.userId,
          email: "candidate@example.com",
          status: "ACTIVE",
          emailVerified: true,
          roles: session.roles,
          hasPassword: true,
          googleLinked: true
        });
      }
      if (target.endsWith("/auth/sessions")) {
        return json([
          {
            sessionId: "20",
            clientType: "WEB",
            deviceName: "Google · Browser",
            userAgent: "UA",
            createdIp: "127.0.0.1",
            lastSeenIp: "127.0.0.1",
            authenticatedAt: "2026-11-18T10:00:00Z",
            lastSeenAt: "2026-11-18T10:05:00Z",
            idleExpiresAt: "2026-11-25T10:05:00Z",
            absoluteExpiresAt: "2026-12-18T10:00:00Z",
            revokedAt: null,
            revokeReason: null,
            active: true,
            current: true
          },
          {
            sessionId: "19",
            clientType: "WEB",
            deviceName: "Other Browser",
            userAgent: "UA",
            createdIp: "127.0.0.2",
            lastSeenIp: "127.0.0.2",
            authenticatedAt: "2026-11-17T10:00:00Z",
            lastSeenAt: "2026-11-17T10:05:00Z",
            idleExpiresAt: "2026-11-24T10:05:00Z",
            absoluteExpiresAt: "2026-12-17T10:00:00Z",
            revokedAt: null,
            revokeReason: null,
            active: true,
            current: false
          }
        ]);
      }
      if (target.includes("/auth/sessions/") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected test route: ${target}`);
    });

    render(<AccountSecurityPanel session={session} onLogout={onLogout} />);

    expect(await screen.findByText("Phiên hiện tại")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thu hồi" }));
    expect(await screen.findByText(/Phiên đã được thu hồi/)).toBeInTheDocument();
    expect(onLogout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Thu hồi & đăng xuất" }));
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });
});
