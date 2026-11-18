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

it("shows the submitted job title and company and follows exact notification application filters", async () => {
  window.history.replaceState(null, "", "/candidate/applications?application=57");
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.includes("/applications?")) return { items: [{ applicationId: "57", jobId: "9", jobTitle: "Senior Java Engineer",
      companyName: "Synthetic Company", status: "INTERVIEW", appliedAt: "2026-11-01T00:00:00Z", version: 3,
      matchingSupported: false }], total: 1, page: 0, size: 8 };
    return [];
  });
  render(<CandidateJobsPanel session={session} applicationsOnly />);
  expect(await screen.findByText("Senior Java Engineer")).toBeVisible();
  expect(screen.getByText(/Synthetic Company/)).toBeVisible();
  expect(apiRequest).toHaveBeenCalledWith(expect.stringMatching(/applicationId=57.*page=0/), expect.anything());
});

it("preserves the second CV chosen in PreApplyMatchWidget and warns when its version changes", async () => {
  setPendingJobId(null);
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/cvs") {
      return [
        { cvId: "cv-1", title: "CV First", activeVersion: { cvVersionId: "cv-v1", processingStatus: "CONFIRMED" } },
        { cvId: "cv-2", title: "CV Second", activeVersion: { cvVersionId: "cv-v2", processingStatus: "CONFIRMED" } }
      ];
    }
    if (path === "/api/v2/candidate/applications" && options?.method === "POST") {
      return { applicationId: "new-app", matchingSupported: true };
    }
    return original(path, options);
  });

  const onApplied = vi.fn();
  const user = userEvent.setup();
  const { unmount } = render(
    <CandidateJobsPanel
      session={session}
      initialJobId="chosen"
      initialCvId="cv-2"
      initialCvVersionId="cv-v2"
      dialogOnly
      onApplied={onApplied}
    />
  );

  const select = await screen.findByLabelText("Chọn CV đã xác nhận");
  expect(select).toHaveValue("cv-2");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: /^Ứng tuyển$/ }));
  await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith(
    "/api/v2/candidate/applications",
    expect.objectContaining({
      body: JSON.stringify({
        jobId: "chosen",
        cvId: "cv-2",
        cvVersionId: "cv-v2",
        coverLetter: null,
        consentAccepted: true,
        policyVersion: "cv-sharing-v1"
      })
    })
  );

  unmount();

  render(
    <CandidateJobsPanel
      session={session}
      initialJobId="chosen"
      initialCvId="cv-2"
      initialCvVersionId="cv-v2-stale"
      dialogOnly
    />
  );
  expect(await screen.findByText(/Phiên bản CV bạn vừa đối chiếu đã thay đổi/)).toBeInTheDocument();
  expect(screen.getByLabelText("Chọn CV đã xác nhận")).toHaveValue("");
});

it("distinguishes CV loading failure with retry from missing confirmed CVs", async () => {
  setPendingJobId(null);
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  let failCvs = true;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/cvs") {
      if (failCvs) throw new Error("CV service down");
      return [{ cvId: "cv-1", title: "CV Ready", activeVersion: { cvVersionId: "cv-v1", processingStatus: "CONFIRMED" } }];
    }
    return original(path, options);
  });

  const user = userEvent.setup();
  render(<CandidateJobsPanel session={session} initialJobId="chosen" dialogOnly />);
  await screen.findByRole("dialog", { name: "Chosen job" });
  expect(await screen.findByText(/Không thể kết nối tới Gateway/)).toBeInTheDocument();
  expect(screen.queryByText(/Bạn chưa có CV ở trạng thái CONFIRMED/)).not.toBeInTheDocument();

  failCvs = false;
  await user.click(screen.getByRole("button", { name: "Thử lại" }));
  expect(await screen.findByLabelText("Chọn CV đã xác nhận")).toHaveValue("cv-1");
});

it("supports quick inline CV upload, confirmation, and submission from the apply modal", async () => {
  setPendingJobId(null);
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  let newCvStatus = "QUEUED";

  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/cvs" && (!options?.method || options.method === "GET")) {
      return [{ cvId: "cv-old", title: "Old CV", activeVersion: { cvVersionId: "cv-old-v1", processingStatus: "CONFIRMED" } }];
    }
    if (path === "/api/v2/cvs" && options?.method === "POST") {
      return {
        cvId: "cv-new",
        title: "Quick Backend CV",
        status: "ACTIVE",
        version: 0,
        activeVersion: {
          cvVersionId: "cv-new-v1",
          originalFilename: "quick-cv.pdf",
          sizeBytes: 12_345,
          processingStatus: "QUEUED",
          version: 0,
          failureCode: null
        }
      };
    }
    if (path === "/api/v2/cvs/cv-new") {
      return {
        cvId: "cv-new",
        title: "Quick Backend CV",
        status: "ACTIVE",
        version: 0,
        activeVersion: {
          cvVersionId: "cv-new-v1",
          originalFilename: "quick-cv.pdf",
          sizeBytes: 12_345,
          processingStatus: newCvStatus,
          version: 1,
          failureCode: null
        }
      };
    }
    if (path === "/api/v2/parsed-cvs/cv-new-v1" && (!options?.method || options.method === "GET")) {
      return {
        revisionId: "rev-1",
        revisionNumber: 1,
        cvVersionId: "cv-new-v1",
        status: "PARSED",
        payload: {
          skills: [{ raw: "Java", evidenceIds: ["ev-1"], confidence: 0.98 }],
          experiences: [{ titleRaw: "Backend Dev", titleCanonical: "backend", companyRedacted: null, startMonth: "2024-01", endMonth: null, isCurrent: true, responsibilities: [], skillIds: [], evidenceIds: [], confidence: 0.9 }],
          education: [],
          languages: [],
          projects: [],
          certificates: [],
          summary: { totalExperienceMonths: 18, qualityFlags: [] }
        }
      };
    }
    if (path === "/api/v2/parsed-cvs/cv-new-v1/confirm" && options?.method === "POST") {
      newCvStatus = "CONFIRMED";
      return {
        revisionId: "rev-1",
        revisionNumber: 1,
        cvVersionId: "cv-new-v1",
        status: "CONFIRMED",
        payload: {
          skills: [{ raw: "Java", evidenceIds: ["ev-1"], confidence: 0.98 }],
          experiences: [],
          education: [],
          languages: [],
          projects: [],
          certificates: [],
          summary: { totalExperienceMonths: 18, qualityFlags: [] }
        }
      };
    }
    if (path === "/api/v2/candidate/applications" && options?.method === "POST") {
      return { applicationId: "app-quick", matchingSupported: true };
    }
    return original(path, options);
  });

  const onApplied = vi.fn();
  const user = userEvent.setup();
  render(<CandidateJobsPanel session={session} initialJobId="chosen" dialogOnly onApplied={onApplied} />);

  expect(await screen.findByLabelText("Chọn CV đã xác nhận")).toHaveValue("cv-old");
  await user.click(screen.getByRole("tab", { name: /Tải CV mới lên/ }));

  // Guard: submit button stays disabled while in upload mode even if consent is checked.
  await user.click(screen.getByRole("checkbox", { name: /Tôi đồng ý chia sẻ CV/ }));
  expect(screen.getByRole("button", { name: "Ứng tuyển" })).toBeDisabled();

  const file = new File(["%PDF-1.7\nhello"], "quick-cv.pdf", { type: "application/pdf" });
  await user.upload(screen.getByLabelText("File PDF CV (tối đa 10 MiB)"), file);
  await user.type(screen.getByLabelText("Tên CV mới (tuỳ chọn)"), "Quick Backend CV");

  newCvStatus = "PARSED";
  await user.click(screen.getByRole("button", { name: /Tải lên & phân tích CV/ }));

  expect(
    await screen.findByText(
      "Kiểm tra nhanh dữ liệu AI trích xuất rồi bấm xác nhận để dùng CV này ứng tuyển.",
      {},
      { timeout: 4000 }
    )
  ).toBeInTheDocument();
  expect(screen.getByText("Java")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /Xác nhận & chọn CV này/ }));
  expect(await screen.findByLabelText("Chọn CV đã xác nhận", {}, { timeout: 4000 })).toHaveValue("cv-new");
  expect(screen.getByText(/CV "Quick Backend CV" đã được xác nhận và chọn sẵn để ứng tuyển\./)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /^Ứng tuyển$/ }));
  await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
  expect(apiRequest).toHaveBeenCalledWith(
    "/api/v2/candidate/applications",
    expect.objectContaining({
      body: JSON.stringify({
        jobId: "chosen",
        cvId: "cv-new",
        cvVersionId: "cv-new-v1",
        coverLetter: null,
        consentAccepted: true,
        policyVersion: "cv-sharing-v1"
      })
    })
  );
});
