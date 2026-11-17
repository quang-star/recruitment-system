import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "./client";
import { usePagedResource } from "./pagination";

vi.mock("./client", () => ({ apiRequest: vi.fn() }));
beforeEach(() => vi.mocked(apiRequest).mockReset());

it("requests bounded pages, resets filters to page zero and ignores a late response", async () => {
  let finishOld: (value: unknown) => void = () => {};
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    const params = new URL(path, "http://test").searchParams;
    if (params.get("page") === "1") return new Promise((resolve) => { finishOld = resolve; });
    return { items: [params.get("q")], page: 0, total: 25, size: 12 };
  });
  const { result, rerender } = renderHook(({ q }) => usePagedResource<string>("/jobs", { q }), { initialProps: { q: "Java" } });
  await waitFor(() => expect(result.current.items).toEqual(["Java"]));
  act(() => result.current.setPage(1));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/jobs?q=Java&page=1&size=12", expect.anything()));
  rerender({ q: "React" });
  await waitFor(() => expect(result.current.items).toEqual(["React"]));
  expect(result.current.page).toBe(0);
  await act(async () => finishOld({ items: ["stale"], page: 1, total: 25, size: 12 }));
  expect(result.current.items).toEqual(["React"]);
});

it("recovers when the last item on a page leaves the filtered result", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    const page = Number(new URL(path, "http://test").searchParams.get("page"));
    return { items: page ? [] : ["remaining"], page, total: 1, size: 12 };
  });
  const { result } = renderHook(() => usePagedResource<string>("/jobs", {}));
  await waitFor(() => expect(result.current.items).toEqual(["remaining"]));
  act(() => result.current.setPage(1));
  await waitFor(() => expect(result.current.page).toBe(0));
  expect(result.current.items).toEqual(["remaining"]);
});

it("shows an error instead of stale results and supports retry", async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(() => usePagedResource<string>("/jobs", {}));
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.items).toEqual([]);
  vi.mocked(apiRequest).mockResolvedValue({ items: ["restored"], page: 0, total: 1, size: 12 });
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.items).toEqual(["restored"]));
  expect(result.current.error).toBeNull();
});
