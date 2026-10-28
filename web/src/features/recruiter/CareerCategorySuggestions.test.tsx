import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { CareerCategorySuggestions } from "./CareerCategorySuggestions";

vi.mock("../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const category = { industryId: null, industryName: "Kế toán", specializationId: null,
  specializationName: "Báo cáo tài chính", positionId: null, positionName: "Kế toán tổng hợp" };
const suggestion = { status: "SUGGESTED", reasonCode: null, inputHash: "a".repeat(64), catalogHash: "b".repeat(64),
  suggestions: [{ category, evidenceQuotes: ["Lập báo cáo tài chính"] }] };
function props() {
  return { draft: { title: "Kế toán", description: "Lập báo cáo tài chính", requirementsText: "Kinh nghiệm kế toán", externalAiConsent: true },
    userId: "user", companyId: "company", jobId: null as string | null, jobVersionId: null as string | null,
    accessToken: "synthetic-token", disabled: false, onApply: vi.fn() };
}
function deferred() {
  let resolve!: (value: typeof suggestion) => void;
  const promise = new Promise<typeof suggestion>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.mocked(apiRequest).mockReset(); });

it("requests only after explicit consent and applies only after a separate click", async () => {
  const initial = props();
  vi.mocked(apiRequest).mockResolvedValue(suggestion);
  const view = render(<CareerCategorySuggestions {...initial} draft={{ ...initial.draft, externalAiConsent: false }} />);
  expect(screen.getByRole("button", { name: "Gợi ý phân loại nghề" })).toBeDisabled();
  expect(apiRequest).not.toHaveBeenCalled();
  view.rerender(<CareerCategorySuggestions {...initial} />);
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  await screen.findByRole("button", { name: "Áp dụng gợi ý 1" });
  expect(initial.onApply).not.toHaveBeenCalled();
  const [path, options] = vi.mocked(apiRequest).mock.calls[0];
  expect(path).toBe("/api/v2/parsed-jds/category-suggestions");
  expect(JSON.parse(options!.body as string)).toEqual({ ...initial.draft, externalAiPolicyVersion: "external-ai/1.0" });
  expect(screen.getByText("Lập báo cáo tài chính")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng gợi ý 1" }));
  expect(initial.onApply).toHaveBeenCalledExactlyOnceWith(category);
  expect(apiRequest).toHaveBeenCalledTimes(1);
});

it.each(["EXTERNAL_AI_NOT_CONFIGURED", "EXTERNAL_AI_LIMIT_REACHED", "EXTERNAL_AI_ALREADY_REQUESTED", "INVALID_SUGGESTION"])
  ("keeps manual editing available for %s", async (reasonCode) => {
    const initial = props();
    vi.mocked(apiRequest).mockResolvedValue({ ...suggestion, status: "MANUAL", reasonCode, suggestions: [] });
    render(<CareerCategorySuggestions {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
    expect(await screen.findByRole("status")).toHaveTextContent("thủ công");
    expect(screen.queryByRole("button", { name: "Áp dụng gợi ý 1" })).not.toBeInTheDocument();
    expect(initial.onApply).not.toHaveBeenCalled();
  });

it.each(["title", "description", "requirementsText", "consent", "company", "job", "version", "user", "permission"])
  ("discards pending and visible suggestions when %s changes", async (changed) => {
    const initial = props();
    const pending = deferred();
    vi.mocked(apiRequest).mockReturnValue(pending.promise);
    const view = render(<CareerCategorySuggestions {...initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
    const next = { ...initial, draft: { ...initial.draft } };
    if (changed === "title" || changed === "description" || changed === "requirementsText") next.draft[changed] = "Changed source";
    if (changed === "consent") next.draft.externalAiConsent = false;
    if (changed === "company") next.companyId = "another-company";
    if (changed === "job") next.jobId = "another-job";
    if (changed === "version") next.jobVersionId = "another-version";
    if (changed === "user") next.userId = "another-user";
    if (changed === "permission") next.disabled = true;
    view.rerender(<CareerCategorySuggestions {...next} />);
    expect(vi.mocked(apiRequest).mock.calls[0][1]!.signal!.aborted).toBe(true);
    await act(async () => { pending.resolve(suggestion); await pending.promise; });
    expect(screen.queryByRole("button", { name: "Áp dụng gợi ý 1" })).not.toBeInTheDocument();
    expect(initial.onApply).not.toHaveBeenCalled();
    // Returning to the original input still cannot resurrect an earlier request.
    view.rerender(<CareerCategorySuggestions {...initial} />);
    expect(screen.queryByRole("button", { name: "Áp dụng gợi ý 1" })).not.toBeInTheDocument();
  });

it("clears displayed suggestions after editing the draft and ignores older responses after a newer request", async () => {
  const initial = props();
  vi.mocked(apiRequest).mockResolvedValueOnce(suggestion);
  const view = render(<CareerCategorySuggestions {...initial} />);
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  await screen.findByRole("button", { name: "Áp dụng gợi ý 1" });
  const next = { ...initial, draft: { ...initial.draft, title: "New source" } };
  view.rerender(<CareerCategorySuggestions {...next} />);
  expect(screen.queryByRole("button", { name: "Áp dụng gợi ý 1" })).not.toBeInTheDocument();
  const pending = deferred();
  vi.mocked(apiRequest).mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  view.rerender(<CareerCategorySuggestions {...initial} />);
  vi.mocked(apiRequest).mockResolvedValueOnce({ ...suggestion, suggestions: [{ category: { ...category, positionName: "Current choice" }, evidenceQuotes: ["Lập báo cáo tài chính"] }] });
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  await screen.findByText(/Current choice/);
  await act(async () => { pending.resolve(suggestion); await pending.promise; });
  expect(screen.getByText(/Current choice/)).toBeVisible();
});

it("handles transport and malformed results without applying data or exposing error details", async () => {
  const initial = props();
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("private transport body"));
  render(<CareerCategorySuggestions {...initial} />);
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  expect(await screen.findByRole("status")).toHaveTextContent("chưa khả dụng");
  vi.mocked(apiRequest).mockResolvedValueOnce({ ...suggestion, suggestions: [{ category: {} }] });
  fireEvent.click(screen.getByRole("button", { name: "Gợi ý phân loại nghề" }));
  expect(await screen.findByRole("status")).toHaveTextContent("chưa khả dụng");
  expect(screen.queryByText(/private transport body/)).not.toBeInTheDocument();
  expect(initial.onApply).not.toHaveBeenCalled();
});
