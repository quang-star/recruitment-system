import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { CandidateApplyModal } from "./CandidateApplyModal";
import type { Cv, Job } from "./candidateJobTypes";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(),
  apiRequest: vi.fn()
}));

const sampleJob: Job = {
  jobId: "job-1",
  title: "Backend Engineer",
  description: "Java microservices",
  requirementsText: "Java",
  locationText: "Hà Nội",
  workMode: "HYBRID",
  employmentType: "FULL_TIME",
  openings: 1,
  companyId: "comp-1"
};

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
});

it("auto-opens the quick CV upload tab when the candidate has zero confirmed CVs and validates file type/size", async () => {
  const user = userEvent.setup({ applyAccept: false });
  const onCvConfirmed = vi.fn();

  render(
    <CandidateApplyModal
      pendingJob={sampleJob}
      confirmedCvs={[]}
      selectedCv={null}
      accessToken="token-1"
      uploadPollIntervalMs={5}
      confirmSyncIntervalMs={5}
      coverLetter=""
      consentAccepted={false}
      submitting={false}
      error={null}
      onClose={vi.fn()}
      onSelectCv={vi.fn()}
      onCvConfirmed={onCvConfirmed}
      onOpenCvLibrary={vi.fn()}
      onCoverLetterChange={vi.fn()}
      onConsentChange={vi.fn()}
      onPreviewCv={vi.fn()}
      onSubmit={vi.fn()}
    />
  );

  expect(screen.getByRole("tab", { name: /Tải CV mới lên/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText(/Bạn chưa có CV nào đã xác nhận trong thư viện/)).toBeInTheDocument();

  // Reject non-PDF upload without calling the backend.
  const badFile = new File(["plain text"], "notes.txt", { type: "text/plain" });
  const input = screen.getByLabelText("File PDF CV (tối đa 10 MiB)");
  await user.upload(input, badFile);
  expect(screen.getByText("Chỉ hỗ trợ tệp định dạng PDF (.pdf).")).toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalled();

  // Also ensure switching to the empty select tab displays both action buttons cleanly.
  await user.click(screen.getByRole("tab", { name: /Chọn CV có sẵn \(0\)/ }));
  expect(screen.getByRole("button", { name: "Tải CV mới lên ngay" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mở CV của tôi" })).toBeInTheDocument();
});

it("handles parse failure with retry recovery and external AI consent flag", async () => {
  const user = userEvent.setup();
  const onCvConfirmed = vi.fn();
  let statusCalls = 0;

  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/cvs" && options?.method === "POST") {
      const form = options.body as FormData;
      expect(form.get("externalAiConsent")).toBe("true");
      expect(form.get("externalAiPolicyVersion")).toBe("external-ai/1.0");
      return {
        cvId: "cv-retry",
        title: "Scan CV",
        status: "ACTIVE",
        version: 0,
        activeVersion: {
          cvVersionId: "cv-retry-v1",
          originalFilename: "scan.pdf",
          sizeBytes: 2048,
          processingStatus: "QUEUED",
          version: 0,
          failureCode: null
        }
      };
    }
    if (path === "/api/v2/cvs/cv-retry") {
      statusCalls++;
      if (statusCalls === 1) {
        return {
          cvId: "cv-retry",
          title: "Scan CV",
          activeVersion: {
            cvVersionId: "cv-retry-v1",
            originalFilename: "scan.pdf",
            processingStatus: "FAILED",
            version: 1,
            failureCode: "SOURCE_STORAGE_UNAVAILABLE"
          }
        };
      }
      return {
        cvId: "cv-retry",
        title: "Scan CV",
        activeVersion: {
          cvVersionId: "cv-retry-v1",
          originalFilename: "scan.pdf",
          processingStatus: statusCalls >= 3 ? "CONFIRMED" : "PARSED",
          version: 2,
          failureCode: null
        }
      };
    }
    if (path === "/api/v2/cvs/cv-retry/retry" && options?.method === "POST") {
      return {
        cvId: "cv-retry",
        title: "Scan CV",
        activeVersion: {
          cvVersionId: "cv-retry-v1",
          originalFilename: "scan.pdf",
          processingStatus: "QUEUED",
          version: 2,
          failureCode: null
        }
      };
    }
    if (path === "/api/v2/parsed-cvs/cv-retry-v1") {
      return {
        revisionId: "rev-r1",
        revisionNumber: 1,
        cvVersionId: "cv-retry-v1",
        status: "PARSED",
        payload: {
          skills: [],
          experiences: [],
          education: [],
          languages: [],
          projects: [],
          certificates: [],
          summary: { totalExperienceMonths: 0, qualityFlags: ["LOCAL_FALLBACK"] }
        }
      };
    }
    if (path === "/api/v2/parsed-cvs/cv-retry-v1/confirm" && options?.method === "POST") {
      return {
        revisionId: "rev-r1",
        revisionNumber: 1,
        cvVersionId: "cv-retry-v1",
        status: "CONFIRMED",
        payload: {
          skills: [],
          experiences: [],
          education: [],
          languages: [],
          projects: [],
          certificates: [],
          summary: { totalExperienceMonths: 0, qualityFlags: [] }
        }
      };
    }
    throw new Error(`Unexpected request: ${path}`);
  });

  const existingCv: Cv = {
    cvId: "cv-existing",
    title: "Existing CV",
    activeVersion: { cvVersionId: "cv-ex-v1", processingStatus: "CONFIRMED" }
  };

  render(
    <CandidateApplyModal
      pendingJob={sampleJob}
      confirmedCvs={[existingCv]}
      selectedCv={existingCv}
      accessToken="token-1"
      uploadPollIntervalMs={5}
      confirmSyncIntervalMs={5}
      coverLetter=""
      consentAccepted={false}
      submitting={false}
      error={null}
      onClose={vi.fn()}
      onSelectCv={vi.fn()}
      onCvConfirmed={onCvConfirmed}
      onOpenCvLibrary={vi.fn()}
      onCoverLetterChange={vi.fn()}
      onConsentChange={vi.fn()}
      onPreviewCv={vi.fn()}
      onSubmit={vi.fn()}
    />
  );

  await user.click(screen.getByRole("button", { name: "+ Tải CV mới" }));
  await user.upload(
    screen.getByLabelText("File PDF CV (tối đa 10 MiB)"),
    new File(["%PDF-1.7\nscan"], "scan.pdf", { type: "application/pdf" })
  );
  await user.click(screen.getByRole("checkbox", { name: /Cho phép dịch vụ AI bên ngoài/ }));
  await user.click(screen.getByRole("button", { name: /Tải lên & phân tích CV/ }));

  expect(await screen.findByText(/Dịch vụ lưu trữ chưa kết nối được/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Thử phân tích lại" }));

  expect(await screen.findByText(/AI chưa trích xuất được kỹ năng hoặc kinh nghiệm/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Xác nhận & chọn CV này/ }));

  await waitFor(() =>
    expect(onCvConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({
        cvId: "cv-retry",
        title: "Scan CV"
      })
    )
  );
});
