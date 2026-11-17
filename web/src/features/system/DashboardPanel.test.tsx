import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { DashboardPanel } from "./DashboardPanel";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(),
  apiRequest: vi.fn()
}));

const recruiterSession: AuthSession = {
  accessToken: "mock-token",
  userId: "recruiter-1",
  roles: ["RECRUITER"]
} as AuthSession;

describe("DashboardPanel Recruiter Action Center", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("shows urgent action banner with submitted and underReview counts and routes to pendingJobId", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.startsWith("/api/v2/dashboard")) {
        return {
          audience: "RECRUITER",
          metrics: {
            jobs: 3,
            publishedJobs: 2,
            draftJobs: 1,
            closedJobs: 0,
            applications: 5,
            submitted: 3,
            underReview: 1,
            shortlisted: 1
          },
          pendingJobId: "job-urgent-id",
          pendingJobTitle: "Senior Java Backend Engineer"
        };
      }
      if (path.startsWith("/api/v2/jobs?")) {
        return {
          items: [
            {
              jobId: "job-urgent-id",
              title: "Senior Java Backend Engineer",
              locationText: "Hà Nội",
              workMode: "HYBRID",
              openings: 2,
              status: "PUBLISHED",
              requirementsText: "Java Kafka Spring Boot"
            }
          ],
          total: 1,
          page: 0,
          size: 4
        };
      }
      return { items: [], total: 0, page: 0, size: 4 };
    });

    const onOpenJob = vi.fn();
    const onNavigate = vi.fn();

    render(
      <DashboardPanel
        session={recruiterSession}
        companyId="company-1"
        onLogout={vi.fn()}
        onNavigate={onNavigate}
        onOpenJob={onOpenJob}
      />
    );

    expect(await screen.findByText("4 việc cần xử lý")).toBeInTheDocument();
    expect(screen.getByText("3 hồ sơ mới nộp, 1 hồ sơ đang xem xét")).toBeInTheDocument();
    expect(screen.getByText(/Ưu tiên xử lý vị trí: "Senior Java Backend Engineer"/)).toBeInTheDocument();

    const actionButton = screen.getByRole("button", { name: "Xử lý vị trí này →" });
    fireEvent.click(actionButton);
    expect(onOpenJob).toHaveBeenCalledWith("job-urgent-id");
  });

  it("renders calm state when all applications have been reviewed", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.startsWith("/api/v2/dashboard")) {
        return {
          audience: "RECRUITER",
          metrics: {
            jobs: 2,
            publishedJobs: 2,
            draftJobs: 0,
            closedJobs: 0,
            applications: 4,
            submitted: 0,
            underReview: 0,
            shortlisted: 4
          },
          pendingJobId: null,
          pendingJobTitle: null
        };
      }
      return { items: [], total: 0, page: 0, size: 4 };
    });

    render(
      <DashboardPanel
        session={recruiterSession}
        companyId="company-1"
        onLogout={vi.fn()}
      />
    );

    expect(await screen.findByText("Đã xử lý hết")).toBeInTheDocument();
    expect(screen.getByText("Không có hồ sơ nào đang chờ sơ loại")).toBeInTheDocument();
  });

  it("counts draft jobs from backend metric and distinguishes closed from draft jobs in list", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path.startsWith("/api/v2/dashboard")) {
        return {
          audience: "RECRUITER",
          metrics: {
            jobs: 2,
            publishedJobs: 0,
            draftJobs: 1,
            closedJobs: 1,
            applications: 0,
            submitted: 0,
            underReview: 0
          }
        };
      }
      if (path.startsWith("/api/v2/jobs?")) {
        return {
          items: [
            {
              jobId: "job-draft",
              title: "Draft Job Position",
              openings: 1,
              status: "DRAFT",
              requirementsText: "React TypeScript"
            },
            {
              jobId: "job-closed",
              title: "Old Closed Position",
              openings: 1,
              status: "CLOSED",
              requirementsText: "Python"
            }
          ],
          total: 2,
          page: 0,
          size: 4
        };
      }
      return { items: [], total: 0, page: 0, size: 4 };
    });

    render(
      <DashboardPanel
        session={recruiterSession}
        companyId="company-1"
        onLogout={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    expect(await screen.findByText("1 tin tuyển dụng ở trạng thái bản nháp")).toBeInTheDocument();
    expect(screen.getByText("Bản nháp")).toBeInTheDocument();
    expect(screen.getByText("Đã đóng")).toBeInTheDocument();
  });
});
