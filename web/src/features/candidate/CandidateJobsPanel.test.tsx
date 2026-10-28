import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { CandidateJobsPanel } from "./CandidateJobsPanel";
import { apiRequest } from "../../shared/api/client";
import { setPendingJobId, getPendingJobId } from "../../shared/pendingApplication";
import { AuthSession } from "../../shared/auth/session";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn()
}));
const session = { accessToken: "test-token", userId: "candidate", roles: ["CANDIDATE"] } as AuthSession;
beforeEach(() => {
  vi.mocked(apiRequest).mockClear();
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.startsWith("/api/v2/candidate/jobs?")) {
      const selected = new URL(path, "http://test").searchParams.get("jobId");
      const jobs = [
        { jobId: "first", title: "First job", description: "", requirementsText: "", openings: 1 },
        { jobId: "chosen", title: "Chosen job", description: "", requirementsText: "", openings: 1 }
      ];
      const items = selected ? jobs.filter((job) => job.jobId === selected) : jobs.slice(0, 1);
      return { items, total: items.length, page: 0, size: 12 };
    }
    if (path.startsWith("/api/v2/candidate/applications?")) return { items: [], total: 0, page: 0, size: 10 };
    return [];
  });
});

it("opens the chosen public job for review without automatically submitting", async () => {
  setPendingJobId("chosen");
  render(<CandidateJobsPanel session={session} />);
  expect(await screen.findByRole("dialog", { name: "Chosen job" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ứng tuyển" })).toBeDisabled();
  expect(getPendingJobId()).toBeNull();
  expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("explains when the pending public job is no longer available", async () => {
  setPendingJobId("closed-job");
  render(<CandidateJobsPanel session={session} />);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("không còn tuyển dụng"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(getPendingJobId()).toBeNull();
});

it("opens an application from the shared portal without loading separate job/application lists", async () => {
  setPendingJobId(null);
  const close = vi.fn();
  const user = userEvent.setup();
  render(<CandidateJobsPanel session={session} initialJobId="chosen" dialogOnly onClose={close} />);
  expect(await screen.findByRole("dialog", { name: "Chosen job" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Tìm việc làm" })).not.toBeInTheDocument();
  const paths = vi.mocked(apiRequest).mock.calls.map(([path]) => path);
  expect(paths.some((path) => path.startsWith("/api/v2/candidate/applications?"))).toBe(false);
  expect(paths.filter((path) => path.startsWith("/api/v2/candidate/jobs?"))).toHaveLength(1);
  await user.keyboard("{Escape}");
  expect(close).toHaveBeenCalledOnce();
});

it("keeps explicit CV consent and idempotency when submitting from the shared portal", async () => {
  setPendingJobId(null);
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/cvs") return [{ cvId: "cv", title: "Backend CV", activeVersion: { cvVersionId: "cv-version", processingStatus: "CONFIRMED" } }];
    if (path === "/api/v2/candidate/applications" && options?.method === "POST") return { applicationId: "new-application", matchingSupported: true };
    return original(path, options);
  });
  const onApplied = vi.fn();
  const user = userEvent.setup();
  render(<CandidateJobsPanel session={session} initialJobId="chosen" dialogOnly onApplied={onApplied} />);
  await screen.findByRole("dialog", { name: "Chosen job" });
  expect(screen.getByRole("button", { name: /^Ứng tuyển$/ })).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /^Ứng tuyển$/ }));
  await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith("/api/v2/candidate/applications", expect.objectContaining({
    accessToken: "test-token", idempotencyKey: expect.any(String),
    body: JSON.stringify({ jobId: "chosen", cvId: "cv", cvVersionId: "cv-version", coverLetter: null, consentAccepted: true, policyVersion: "cv-sharing-v1" })
  }));
});

it("closes the apply dialog with Escape without submitting an application", async () => {
  const user = userEvent.setup();
  render(<CandidateJobsPanel session={session} />);
  const trigger = await screen.findByRole("button", { name: "Ứng tuyển vị trí này" });
  await user.click(trigger);
  expect(screen.getByRole("dialog")).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("requests fresh sharing consent after closing and reopening an application", async () => {
  const user = userEvent.setup();
  render(<CandidateJobsPanel session={session} />);
  const trigger = await screen.findByRole("button", { name: "Ứng tuyển vị trí này" });
  await user.click(trigger);
  const consent = screen.getByRole("checkbox", { name: /Tôi đồng ý chia sẻ CV/ });
  expect(consent).not.toBeChecked();
  await user.click(consent);
  await user.keyboard("{Escape}");
  await user.click(trigger);
  expect(screen.getByRole("checkbox", { name: /Tôi đồng ý chia sẻ CV/ })).not.toBeChecked();
  expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});
