import type { ApiError, RequestOptions } from "./contracts";
import { AuthSession, clearSession, loadSession, sessionForToken, sessionGeneration, updateSession } from "../auth/session";

const gatewayBaseUrl = import.meta.env.VITE_GATEWAY_URL ?? "";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError
  ) {
    super(error.message);
  }
}

export class SessionChangedError extends Error {
  constructor() { super("Phiên đăng nhập đã thay đổi. Vui lòng thực hiện lại thao tác."); }
}

let refreshing: { generation: number; promise: Promise<AuthSession> } | null = null;

async function refreshSession(original: AuthSession, generation: number): Promise<AuthSession> {
  if (refreshing?.generation === generation) return refreshing.promise;
  const promise = (async () => {
    const response = await fetch(`${gatewayBaseUrl}/api/v2/auth/refresh`, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Correlation-Id": createCorrelationId() },
      body: JSON.stringify({ refreshToken: original.refreshToken })
    });
    if (generation !== sessionGeneration()) throw new SessionChangedError();
    if (!response.ok) {
      const error = new ApiClientError(response.status, await readError(response));
      if (generation === sessionGeneration() && loadSession()?.refreshToken === original.refreshToken
        && (response.status === 401 || error.error.code === "INVALID_REFRESH_TOKEN" || error.error.code === "SESSION_NOT_FOUND")) {
        clearSession();
      }
      throw error;
    }
    const rotated = await response.json() as AuthSession;
    if (rotated.userId !== original.userId || typeof rotated.accessToken !== "string" || !rotated.accessToken
      || typeof rotated.refreshToken !== "string" || !rotated.refreshToken || !Array.isArray(rotated.roles)
      || !rotated.roles.every((role) => typeof role === "string")
      || typeof rotated.accessTokenExpiresAt !== "string" || typeof rotated.refreshTokenExpiresAt !== "string") {
      throw new Error("Không xác minh được phiên đăng nhập mới. Vui lòng thử lại.");
    }
    if (!updateSession(rotated, original.refreshToken, generation)) throw new SessionChangedError();
    return rotated;
  })();
  refreshing = { generation, promise };
  try { return await promise; }
  finally { if (refreshing?.promise === promise) refreshing = null; }
}

async function authenticatedFetch(path: string, requestInit: RequestInit, headers: Headers, token?: string): Promise<Response> {
  const current = sessionForToken(token);
  if (token && loadSession() && !current) throw new SessionChangedError();
  const generation = sessionGeneration();
  const managed = current !== null;
  let sentToken = current?.accessToken ?? token;
  if (sentToken) headers.set("Authorization", `Bearer ${sentToken}`);
  let response = await fetch(`${gatewayBaseUrl}${path}`, { ...requestInit, headers });
  if (managed && generation !== sessionGeneration()) throw new SessionChangedError();
  const excluded = ["/api/v2/auth/refresh", "/api/v2/auth/login", "/api/v2/auth/logout"].includes(path.split("?")[0]);
  const replayable = !(typeof ReadableStream !== "undefined" && requestInit.body instanceof ReadableStream);
  if (response.status !== 401 || !managed || excluded || !replayable) return response;
  requestInit.signal?.throwIfAborted();
  const error = await readError(response);
  if (generation !== sessionGeneration()) throw new SessionChangedError();
  if (error.code === "CURRENT_USER_UNAVAILABLE") { clearSession(); throw new ApiClientError(401, error); }
  let session = loadSession();
  if (!session || generation !== sessionGeneration()) throw new SessionChangedError();
  if (session.accessToken === sentToken) session = await refreshSession(session, generation);
  requestInit.signal?.throwIfAborted();
  if (generation !== sessionGeneration()) throw new SessionChangedError();
  sentToken = session.accessToken;
  const retryHeaders = new Headers(headers);
  retryHeaders.set("Authorization", `Bearer ${sentToken}`);
  response = await fetch(`${gatewayBaseUrl}${path}`, { ...requestInit, headers: retryHeaders });
  if (generation !== sessionGeneration()) throw new SessionChangedError();
  if (response.status === 401 && loadSession()?.accessToken === sentToken) clearSession();
  return response;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, idempotencyKey, ...requestInit } = options;
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Correlation-Id", createCorrelationId());
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (requestInit.body && !(requestInit.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  const response = await authenticatedFetch(path, requestInit, headers, accessToken);
  if (!response.ok) {
    throw new ApiClientError(response.status, await readError(response));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiDownload(path: string, options: RequestOptions = {}): Promise<{ blob: Blob; filename: string }> {
  const { accessToken, idempotencyKey: _idempotencyKey, ...requestInit } = options;
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/pdf");
  headers.set("X-Correlation-Id", createCorrelationId());
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await authenticatedFetch(path, requestInit, headers, accessToken);
  if (!response.ok) throw new ApiClientError(response.status, await readError(response));
  return {
    blob: await response.blob(),
    filename: response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1]
      ?? "candidate-cv.pdf"
  };
}

function createCorrelationId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  // randomUUID is restricted to secure contexts, while getRandomValues is also
  // available when the local demo is opened through a plain HTTP LAN hostname.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const error = await response.json() as ApiError;
    if (typeof error?.code !== "string" || typeof error.message !== "string") throw new Error("Invalid error response");
    return error;
  } catch {
    return {
      code: "HTTP_ERROR",
      message: `Request failed with status ${response.status}`,
      details: {},
      correlationId: response.headers.get("X-Correlation-Id") ?? "unknown",
      timestamp: new Date().toISOString()
    };
  }
}
