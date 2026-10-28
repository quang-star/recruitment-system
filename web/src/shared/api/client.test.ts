import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiDownload, apiRequest, SessionChangedError } from "./client";
import { AuthSession, clearSession, loadSession, saveSession } from "../auth/session";

const original: AuthSession = { userId: "user-1", accessToken: "old-access", refreshToken: "old-refresh",
  accessTokenExpiresAt: "2026-09-30T00:00:00Z", refreshTokenExpiresAt: "2026-12-01T00:00:00Z", roles: ["CANDIDATE"] };
const rotated: AuthSession = { ...original, accessToken: "new-access", refreshToken: "new-refresh" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const unauthorized = () => json({ code: "HTTP_ERROR", message: "Expired" }, 401);

beforeEach(() => { clearSession(); saveSession(original); });
afterEach(() => { clearSession(); vi.restoreAllMocks(); });

it("shares one refresh across concurrent requests and preserves the original operation headers/body", async () => {
  const calls: RequestInit[] = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/auth/refresh")) return json(rotated);
    calls.push(init!);
    return new Headers(init?.headers).get("Authorization") === "Bearer new-access" ? json({ ok: true }) : unauthorized();
  });
  const options = { accessToken: original.accessToken, method: "POST", body: '{"name":"draft"}', idempotencyKey: "same-operation" };
  await expect(Promise.all([apiRequest("/api/v2/action", options), apiRequest("/api/v2/other", options)]))
    .resolves.toEqual([{ ok: true }, { ok: true }]);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
  expect(loadSession()).toEqual(rotated);
  for (const init of calls) {
    expect(init.body).toBe(options.body);
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe("same-operation");
  }
  expect(new Headers(calls[0].headers).get("X-Correlation-Id")).toBe(new Headers(calls[2].headers).get("X-Correlation-Id"));
});

it("uses the current rotated token for a component still holding the old access token", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
    String(url).endsWith("/auth/refresh") ? json(rotated)
      : new Headers(init?.headers).get("Authorization") === "Bearer new-access" ? json({ ok: true }) : unauthorized());
  await apiRequest("/api/v2/first", { accessToken: original.accessToken });
  await apiRequest("/api/v2/second", { accessToken: original.accessToken });
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("does not send a previous account's token after another account has signed in", async () => {
  saveSession({ ...original, userId: "user-2", accessToken: "other-access", refreshToken: "other-refresh" });
  const fetchMock = vi.spyOn(globalThis, "fetch");
  await expect(apiRequest("/api/v2/secure", { accessToken: original.accessToken })).rejects.toBeInstanceOf(SessionChangedError);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(loadSession()?.userId).toBe("user-2");
});

it.each(["network", "unavailable"])("keeps the session when refresh has a %s failure", async (failure) => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (!String(url).endsWith("/auth/refresh")) return unauthorized();
    if (failure === "network") throw new TypeError("Network unavailable");
    return json({ code: "UNAVAILABLE", message: "Try later" }, 503);
  });
  await expect(apiRequest("/api/v2/secure", { accessToken: original.accessToken })).rejects.toThrow();
  expect(loadSession()).toEqual(original);
});

it("clears only an actually invalid refresh session without looping", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith("/auth/refresh") ? json({ code: "INVALID_REFRESH_TOKEN", message: "Sign in again" }, 401) : unauthorized());
  await expect(apiRequest("/api/v2/secure", { accessToken: original.accessToken })).rejects.toThrow();
  expect(loadSession()).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("retries an authenticated request only once if the new access token is also rejected", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
    String(url).endsWith("/auth/refresh") ? json(rotated) : unauthorized());
  await expect(apiRequest("/api/v2/secure", { accessToken: original.accessToken })).rejects.toThrow();
  expect(loadSession()).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it.each(["logout", "switch"])("does not restore a stale session after %s while refresh is running", async (action) => {
  let release!: (response: Response) => void;
  const waiting = new Promise<Response>((resolve) => { release = resolve; });
  let refreshStarted!: () => void;
  const started = new Promise<void>((resolve) => { refreshStarted = resolve; });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/auth/refresh")) { refreshStarted(); return waiting; }
    return unauthorized();
  });
  const pending = apiRequest("/api/v2/secure", { accessToken: original.accessToken });
  const rejected = expect(pending).rejects.toBeInstanceOf(SessionChangedError);
  await started;
  if (action === "logout") clearSession();
  else saveSession({ ...original, userId: "user-2", accessToken: "other", refreshToken: "other-refresh" });
  release(json(rotated));
  await rejected;
  expect(loadSession()?.userId ?? null).toBe(action === "logout" ? null : "user-2");
});

it("refreshes PDF downloads and keeps the response filename", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).endsWith("/auth/refresh")) return json(rotated);
    if (new Headers(init?.headers).get("Authorization") !== "Bearer new-access") return unauthorized();
    return new Response("synthetic PDF", { headers: { "Content-Disposition": 'attachment; filename="cv.pdf"' } });
  });
  const result = await apiDownload("/api/v2/cv", { accessToken: original.accessToken });
  expect(result.filename).toBe("cv.pdf");
  expect(result.blob.size).toBe(13);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("does not refresh public/auth endpoints, forbidden responses, or a failed network operation", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(unauthorized());
  await expect(apiRequest("/api/v2/auth/login", { accessToken: original.accessToken })).rejects.toThrow();
  await expect(apiRequest("/api/v2/public/anything")).rejects.toThrow();
  fetchMock.mockResolvedValueOnce(json({ code: "FORBIDDEN", message: "Not permitted" }, 403));
  await expect(apiRequest("/api/v2/secure", { accessToken: original.accessToken })).rejects.toThrow();
  fetchMock.mockRejectedValueOnce(new TypeError("Connection lost"));
  await expect(apiRequest("/api/v2/action", { accessToken: original.accessToken, method: "POST" })).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(loadSession()).toEqual(original);
});
