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
  headers.set("X-Correlation-Id", crypto.randomUUID());
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (requestInit.body && !(requestInit.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  const response = await fetch(`${gatewayBaseUrl}${path}`, { ...requestInit, headers });
  if (!response.ok) {
    let error: ApiError;
    try {
      error = (await response.json()) as ApiError;
    } catch {
      error = {
        code: "HTTP_ERROR",
        message: `Request failed with status ${response.status}`,
        details: {},
        correlationId: response.headers.get("X-Correlation-Id") ?? "unknown",
        timestamp: new Date().toISOString()
      };
    }
    throw new ApiClientError(response.status, error);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
