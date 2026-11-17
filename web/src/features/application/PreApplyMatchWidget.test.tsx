import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreApplyMatchWidget } from "./PreApplyMatchWidget";
import { PublicJob } from "../public/types";
import { AuthSession } from "../../shared/auth/session";

const sampleJob: PublicJob = {
  jobId: "11111111-1111-1111-1111-111111111111",
  jobVersionId: "22222222-2222-2222-2222-222222222222",
  companyId: "33333333-3333-3333-3333-333333333333",
  companyName: "Acme Tech",
  title: "Senior Java Engineer",
  description: "Build high-throughput systems",
  requirementsText: "Java, Spring Boot, Kafka",
  benefitsText: null,
  locationText: "Hà Nội",
  workMode: "HYBRID",
  employmentType: "FULL_TIME",
  seniorityLevel: "SENIOR",
  openings: 2,
  salaryMin: 30000000,
  salaryMax: 50000000,
  salaryCurrency: "VND",
  salaryNegotiable: false,
  matchingSupported: true,
  skills: ["Java", "Spring Boot", "Kafka"],
};

const sampleSession: AuthSession = {
  userId: "user-123",
  roles: ["CANDIDATE"],
  accessToken: "token-abc",
  refreshToken: "refresh-xyz",
  accessTokenExpiresAt: "2099-01-01T00:00:00Z",
  refreshTokenExpiresAt: "2099-01-01T00:00:00Z",
};

const confirmedCvs = [{ cvId: "cv-001", title: "Java Backend CV", activeVersion: { cvVersionId: "cv-ver-001", processingStatus: "CONFIRMED" } }];
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}
function previewResponse(jobVersionId: string, finalScore: number) {
  return {
    status: "COMPLETED", finalScore, qualityFlags: [], algorithmVersion: "baseline-v5", taxonomyVersion: "1",
    cvVersionId: "cv-ver-001", jobVersionId, explanation: { components: [], claims: [] },
    summary: { matchLevel: "GOOD", headline: "Đã đối chiếu", advice: "Kiểm tra kỹ năng còn thiếu.", supportedSkills: [], missingSkills: [], totalRequiredSkills: 0, matchedRequiredSkills: 0 }
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("PreApplyMatchWidget", () => {
  it("renders guest prompt with login action when session is not provided", () => {
    const handleLogin = vi.fn();
    render(
      <PreApplyMatchWidget
        job={sampleJob}
        onApplyJob={vi.fn()}
        onRequireLogin={handleLogin}
      />
    );

    expect(
      screen.getByText("Đánh giá độ phù hợp với CV trước khi nộp")
    ).toBeInTheDocument();
    const loginBtn = screen.getByRole("button", {
      name: /Đăng nhập để kiểm tra độ phù hợp/i,
    });
    fireEvent.click(loginBtn);
    expect(handleLogin).toHaveBeenCalledTimes(1);
  });

  it("informs candidate when they do not have any confirmed CV", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      })
    );

    const handleOpenCv = vi.fn();
    render(
      <PreApplyMatchWidget
        job={sampleJob}
        session={sampleSession}
        onApplyJob={vi.fn()}
        onOpenCvLibrary={handleOpenCv}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Bạn chưa có CV nào ở trạng thái/i)
      ).toBeInTheDocument();
    });

    const manageBtn = screen.getByRole("button", { name: "Quản lý CV của tôi" });
    fireEvent.click(manageBtn);
    expect(handleOpenCv).toHaveBeenCalledTimes(1);
  });

  it.each(["COMPLETED", "DEGRADED", "INSUFFICIENT_DATA"])("loads confirmed CVs and presents a %s match preview", async (status) => {
    const mockCvs = [
      {
        cvId: "cv-001",
        title: "Java Backend CV",
        activeVersion: {
          cvVersionId: "cv-ver-001",
          processingStatus: "CONFIRMED",
        },
      },
    ];

    const mockPreviewResult = {
      status,
      finalScore: 85,
      qualityFlags: [],
      algorithmVersion: "baseline-v5",
      taxonomyVersion: "1.0.0",
      cvVersionId: "cv-ver-001",
      jobVersionId: sampleJob.jobVersionId,
      explanation: {
        components: [
          {
            name: "REQUIRED_SKILLS",
            weight: 50,
            score: 0.8,
            contribution: 40,
            details: {},
          },
        ],
        claims: [
          { type: "SUPPORTED", subject: "REQUIRED_SKILL", label: "Java" },
          { type: "SUPPORTED", subject: "REQUIRED_SKILL", label: "Spring Boot" },
          { type: "MISSING", subject: "REQUIRED_SKILL", label: "Kafka" },
        ],
      },
      summary: {
        matchLevel: "EXCELLENT",
        headline: "Hồ sơ của bạn rất phù hợp với vị trí này!",
        advice: "Bạn đáp ứng hầu hết kỹ năng trọng yếu. Hãy tự tin ứng tuyển ngay!",
        supportedSkills: ["Java", "Spring Boot"],
        missingSkills: ["Kafka"],
        totalRequiredSkills: 3,
        matchedRequiredSkills: 2,
      },
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/v2/cvs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => mockCvs,
        });
      }
      if (url.includes("/api/v2/matching-requests/preview")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => mockPreviewResult,
        });
      }
      return Promise.reject(new Error("Unknown route"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const handleApply = vi.fn();
    render(
      <PreApplyMatchWidget
        job={sampleJob}
        session={sampleSession}
        onApplyJob={handleApply}
      />
    );

    // Verify CV loaded in selector
    await waitFor(() => {
      expect(screen.getByText("Java Backend CV")).toBeInTheDocument();
    });

    // Click "Kiểm tra ngay"
    const runBtn = screen.getByRole("button", { name: "⚡ Kiểm tra ngay" });
    fireEvent.click(runBtn);

    // Results display
    await waitFor(() => {
      if (status === "INSUFFICIENT_DATA") {
        expect(screen.getByText("Chưa đủ dữ liệu")).toBeInTheDocument();
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(screen.getByText("Chưa đủ dữ liệu để đánh giá độ phù hợp.")).toBeInTheDocument();
        expect(screen.queryByText("Hồ sơ của bạn rất phù hợp với vị trí này!")).not.toBeInTheDocument();
      } else {
        expect(screen.getByRole("img", { name: "Mức độ phù hợp: 5/5 sao · Phù hợp rất cao" })).toBeInTheDocument();
        expect(screen.getByText("Hồ sơ của bạn rất phù hợp với vị trí này!")).toBeInTheDocument();
        expect(screen.getByText("Bạn đáp ứng hầu hết kỹ năng trọng yếu. Hãy tự tin ứng tuyển ngay!")).toBeInTheDocument();
      }
      if (status === "DEGRADED") expect(screen.getByText("Cần kiểm tra thêm")).toBeInTheDocument();
      expect(screen.queryByText("85")).not.toBeInTheDocument();
      expect(screen.queryByText("/100")).not.toBeInTheDocument();
      expect(screen.getByText("Khớp 2/3 kỹ năng cốt lõi")).toBeInTheDocument();
      expect(screen.getByText("Spring Boot")).toBeInTheDocument();
      expect(screen.getByText("Kafka")).toBeInTheDocument();
    });

    // Click apply directly from preview
    const applyBtn = screen.getByRole("button", {
      name: "Ứng tuyển vị trí này với CV đã chọn",
    });
    fireEvent.click(applyBtn);
    expect(handleApply).toHaveBeenCalledWith(sampleJob);
  });

  it("renders non-IT notice when job does not support AI matching", () => {
    const nonItJob: PublicJob = { ...sampleJob, matchingSupported: false };
    render(
      <PreApplyMatchWidget
        job={nonItJob}
        onApplyJob={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        "Vị trí này thuộc nhóm xem xét hồ sơ thủ công, không áp dụng chấm điểm AI tự động."
      )
    ).toBeInTheDocument();
  });

  it("can switch between IT and manual jobs without changing hook order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(confirmedCvs));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<PreApplyMatchWidget job={sampleJob} session={sampleSession} onApplyJob={vi.fn()} />);
    await screen.findByRole("option", { name: "Java Backend CV" });
    expect(() => rerender(<PreApplyMatchWidget job={{ ...sampleJob, matchingSupported: false }} session={sampleSession} onApplyJob={vi.fn()} />)).not.toThrow();
    expect(screen.getByText(/Vị trí này thuộc nhóm xem xét hồ sơ thủ công/)).toBeInTheDocument();
    fetchMock.mockResolvedValue(jsonResponse(confirmedCvs));
    expect(() => rerender(<PreApplyMatchWidget job={sampleJob} session={sampleSession} onApplyJob={vi.fn()} />)).not.toThrow();
    expect(await screen.findByRole("button", { name: "⚡ Kiểm tra ngay" })).toBeEnabled();
  });

  it("shows CV loading failures and lets the candidate retry instead of claiming there are no CVs", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Network unavailable"))
      .mockImplementation(async () => jsonResponse(confirmedCvs));
    vi.stubGlobal("fetch", fetchMock);
    render(<PreApplyMatchWidget job={sampleJob} session={sampleSession} onApplyJob={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa tải được danh sách CV");
    expect(screen.queryByText(/Bạn chưa có CV nào/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử tải lại CV" }));
    expect(await screen.findByRole("option", { name: "Java Backend CV" })).toBeInTheDocument();
  });

  it.each(["job", "version"])("cancels a pending preview when the %s changes and ignores its late response", async (change) => {
    let finishFirst!: (response: Response) => void;
    let previewCalls = 0;
    const nextJob = { ...sampleJob, jobId: change === "job" ? "next-job" : sampleJob.jobId, jobVersionId: "next-version" };
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/api/v2/cvs")) return Promise.resolve(jsonResponse(confirmedCvs));
      if (++previewCalls === 1) return new Promise<Response>(resolve => { finishFirst = resolve; });
      return Promise.resolve(jsonResponse(previewResponse("next-version", 30)));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<PreApplyMatchWidget job={sampleJob} session={sampleSession} onApplyJob={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "⚡ Kiểm tra ngay" }));
    expect(screen.getByRole("button", { name: "AI đang đối chiếu…" })).toBeDisabled();
    rerender(<PreApplyMatchWidget job={nextJob} session={sampleSession} onApplyJob={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "⚡ Kiểm tra ngay" }));
    expect(await screen.findByRole("img", { name: "Mức độ phù hợp: 2/5 sao · Phù hợp thấp" })).toBeInTheDocument();
    await act(async () => { finishFirst(jsonResponse(previewResponse(sampleJob.jobVersionId!, 90))); });
    expect(screen.queryByRole("img", { name: "Mức độ phù hợp: 5/5 sao · Phù hợp rất cao" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mức độ phù hợp: 2/5 sao · Phù hợp thấp" })).toBeInTheDocument();
  });

  it("explains missing seeded JD data and allows another check after the data becomes available", async () => {
    let available = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/api/v2/cvs")) return jsonResponse(confirmedCvs);
      return available ? jsonResponse(previewResponse(sampleJob.jobVersionId!, 75))
        : jsonResponse({ code: "JD_NOT_FOUND", message: "Confirmed JD was not found for this position" }, 404);
    }));
    render(<PreApplyMatchWidget job={sampleJob} session={sampleSession} onApplyJob={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "⚡ Kiểm tra ngay" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tin tuyển dụng này chưa có dữ liệu JD đã xác nhận");
    expect(screen.getByRole("alert")).toHaveTextContent("JD_NOT_FOUND");
    expect(screen.queryByRole("region", { name: "Kết quả đối chiếu" })).not.toBeInTheDocument();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "⚡ Kiểm tra ngay" }));
    expect(await screen.findByRole("img", { name: "Mức độ phù hợp: 4/5 sao · Phù hợp cao" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps CV preview available but disables matching when the job has no JD version", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(confirmedCvs));
    vi.stubGlobal("fetch", fetchMock);
    render(<PreApplyMatchWidget job={{ ...sampleJob, jobVersionId: undefined }} session={sampleSession} onApplyJob={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "⚡ Kiểm tra ngay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "👁 Xem CV" })).toBeEnabled();
    expect(screen.getByText("Chưa có phiên bản JD được xác nhận để đối chiếu.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
