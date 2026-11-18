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
});
