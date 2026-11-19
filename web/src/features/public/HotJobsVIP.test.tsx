import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { HotJobsVIP } from "./HotJobsVIP";
import { SAVED_JOBS_STORAGE_KEY } from "./savedJobs";
import { PublicJob } from "./types";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(),
  apiRequest: vi.fn()
}));

const sampleJobs: PublicJob[] = [
  {
    jobId: "job-1",
    companyId: "comp-1",
    companyName: "Alpha",
    title: "Backend Java Developer",
    description: "API",
    requirementsText: "Java",
    benefitsText: null,
    locationText: "Hà Nội",
    workMode: "REMOTE",
    employmentType: "FULL_TIME",
    seniorityLevel: "SENIOR",
    openings: 1,
    salaryMin: 25000000,
    salaryMax: 35000000,
    salaryCurrency: "VND",
    salaryNegotiable: false
  },
  {
    jobId: "job-2",
    companyId: "comp-2",
    companyName: "Beta",
    title: "Frontend React Developer",
    description: "UI",
    requirementsText: "React",
    benefitsText: null,
    locationText: "TP.HCM",
    workMode: "HYBRID",
    employmentType: "FULL_TIME",
    seniorityLevel: "JUNIOR",
    openings: 1,
    salaryMin: 15000000,
    salaryMax: 22000000,
    salaryCurrency: "VND",
    salaryNegotiable: false
  }
];

describe("HotJobsVIP saved bookmarks", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists bookmarked jobs across remounts and filters with Đã lưu", () => {
    const { unmount } = render(
      <HotJobsVIP jobs={sampleJobs} onSelectJob={vi.fn()} onApplyJob={vi.fn()} />
    );

    const saveButtons = screen.getAllByRole("button", { name: "Lưu công việc" });
    fireEvent.click(saveButtons[0]);
    unmount();

    render(<HotJobsVIP jobs={sampleJobs} onSelectJob={vi.fn()} onApplyJob={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Đã lưu" }));

    expect(screen.getByText("Backend Java Developer")).toBeInTheDocument();
    expect(screen.queryByText("Frontend React Developer")).not.toBeInTheDocument();
  });

  it("fetches bookmarked jobs that are outside the current homepage list", async () => {
    window.localStorage.setItem(SAVED_JOBS_STORAGE_KEY, JSON.stringify({ "job-offpage": true }));
    vi.mocked(apiRequest).mockResolvedValueOnce({
      items: [{ ...sampleJobs[0], jobId: "job-offpage", title: "Staff Data Engineer" }],
      total: 1,
      page: 0,
      size: 1
    });

    render(<HotJobsVIP jobs={sampleJobs} onSelectJob={vi.fn()} onApplyJob={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Đã lưu" }));

    expect(await screen.findByText("Staff Data Engineer")).toBeInTheDocument();
  });

  it("renders a single unified list with count, quick filter, explore-all link, and item actions", () => {
    const onSelectJob = vi.fn();
    const onApplyJob = vi.fn();
    const onExploreAll = vi.fn();
    const eightJobs: PublicJob[] = Array.from({ length: 8 }, (_, index) => ({
      ...sampleJobs[index % 2],
      jobId: `job-${index + 1}`,
      title: `Software Engineer ${index + 1}`
    }));

    render(
      <HotJobsVIP
        jobs={eightJobs}
        totalJobs={24}
        onSelectJob={onSelectJob}
        onApplyJob={onApplyJob}
        onExploreAll={onExploreAll}
      />
    );

    expect(screen.getByText("24 vị trí đang tuyển")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Software Engineer 8" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem tất cả việc làm" }));
    expect(onExploreAll).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Software Engineer 1" }));
    expect(onSelectJob).toHaveBeenCalledWith(eightJobs[0]);

    fireEvent.click(screen.getByRole("button", { name: "Ứng tuyển Software Engineer 2" }));
    expect(onApplyJob).toHaveBeenCalledWith(eightJobs[1]);
  });

  it("hides total job count while loading or on error and shows empty state when no jobs exist", () => {
    const { rerender } = render(
      <HotJobsVIP jobs={[]} totalJobs={0} loadingJobs onSelectJob={vi.fn()} onApplyJob={vi.fn()} />
    );
    expect(screen.getByText("Đang cập nhật cơ hội việc làm…")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ vị trí đang tuyển$/)).not.toBeInTheDocument();

    rerender(<HotJobsVIP jobs={[]} totalJobs={0} loadingJobs={false} onSelectJob={vi.fn()} onApplyJob={vi.fn()} />);
    expect(screen.getByText("Hiện chưa có vị trí đang tuyển")).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ vị trí đang tuyển$/)).not.toBeInTheDocument();
  });

  it("queries the public jobs API for quick filters across the full catalog and forwards the active preset", async () => {
    const onExploreAll = vi.fn();
    vi.mocked(apiRequest).mockResolvedValueOnce({
      items: [{ ...sampleJobs[0], jobId: "remote-814", title: "Remote Platform Engineer" }],
      total: 42,
      page: 0,
      size: 12
    });

    render(
      <HotJobsVIP
        jobs={sampleJobs}
        totalJobs={814}
        onSelectJob={vi.fn()}
        onApplyJob={vi.fn()}
        onExploreAll={onExploreAll}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Từ xa" }));
    expect(await screen.findByText("Remote Platform Engineer")).toBeInTheDocument();
    expect(screen.getByText("42 vị trí đang tuyển")).toBeInTheDocument();
    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
      "/api/v2/public/jobs?page=0&size=12&sort=newest&workMode=REMOTE",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    fireEvent.click(screen.getByRole("button", { name: "Xem tất cả việc làm" }));
    expect(onExploreAll).toHaveBeenCalledWith({ mode: "REMOTE" });
  });
});
