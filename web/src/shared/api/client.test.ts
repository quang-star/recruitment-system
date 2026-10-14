import { describe, expect, it, vi } from "vitest";

import { apiRequest } from "./client";

describe("apiRequest", () => {
  it("propagates bearer, idempotency and correlation headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ applicationId: "application-1" }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    ));

    await apiRequest("/api/v1/candidate/applications", {
      method: "POST",
      accessToken: "access-token",
      idempotencyKey: "submission-key",
      body: JSON.stringify({ jobId: "job-1" })
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("Idempotency-Key")).toBe("submission-key");
    expect(headers.get("X-Correlation-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("creates a UUID correlation ID when randomUUID is unavailable on plain HTTP", async () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: (values: Uint8Array) => {
        values.set(Array.from({ length: values.length }, (_, index) => index));
        return values;
      }
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    try {
      await apiRequest<void>("/api/v1/health");
      const [, init] = fetchMock.mock.calls[0];
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Correlation-Id")).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
    }
  });
});
