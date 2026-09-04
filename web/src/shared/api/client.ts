import type { ApiError, RequestOptions } from "./contracts";

const gatewayBaseUrl = import.meta.env.VITE_GATEWAY_URL ?? "";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError
  ) {
    super(error.message);
  }
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

  const response = await fetch(`${gatewayBaseUrl}${path}`, { ...requestInit, headers });
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
  const response = await fetch(`${gatewayBaseUrl}${path}`, { ...requestInit, headers });
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
    return (await response.json()) as ApiError;
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
