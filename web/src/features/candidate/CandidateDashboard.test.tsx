import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CandidateDashboard } from "./CandidateDashboard";
import { apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

vi.mock("../../shared/api/client", async (original) => ({ ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn() }));
const session = { accessToken: "test", roles: ["CANDIDATE"] } as AuthSession;
beforeEach(() => {
  vi.mocked(apiRequest).mockClear(); vi.mocked(apiRequest).mockImplementation(async (path) =>
    path === "/api/v2/cvs" ? [] : path === "/api/v2/dashboard" ? { metrics: { applications: 0, underReview: 0, shortlisted: 0 } }
      : { items: [], total: 0, page: 0, size: 4 }); });

it("uses real empty CV state and directs the candidate to upload", async () => {
  const navigate = vi.fn();
  render(<CandidateDashboard session={session} profile={null} onNavigate={navigate} onOpenJob={vi.fn()} />);
  expect(await screen.findByText("Bắt đầu với CV của bạn")).toBeInTheDocument();
  expect(screen.getByText("0 CV sẵn sàng ứng tuyển")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tải CV lên →" }));
  expect(navigate).toHaveBeenCalledWith("cv");
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

it("shows a review action and opens the exact selected job", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path === "/api/v2/cvs"
    ? [{ cvId: "cv", title: "CV", status: "ACTIVE", activeVersion: { processingStatus: "PARSED" } }]
    : path.startsWith("/api/v2/candidate/jobs?") ? { items: [{ jobId: "job-2", title: "React Developer", locationText: "Hà Nội", workMode: "HYBRID" }], total: 1, page: 0, size: 4 } : path === "/api/v2/dashboard" ? { metrics: {} } : { items: [], total: 0, page: 0, size: 4 });
  const open = vi.fn();
  render(<CandidateDashboard session={session} profile={null} onNavigate={vi.fn()} onOpenJob={open} />);
  expect(await screen.findByText("1 CV đang chờ bạn kiểm tra")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /React Developer/ }));
  expect(open).toHaveBeenCalledWith("job-2");
});

it("does not present an unavailable CV response as an empty library", async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error("Unavailable"));
  render(<CandidateDashboard session={session} profile={null} onNavigate={vi.fn()} onOpenJob={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Một số dữ liệu chưa tải được");
  expect(screen.queryByText("0 CV trong thư viện")).not.toBeInTheDocument();
  expect(screen.getAllByText("—")).toHaveLength(4);
});

it("opens application history from the application metrics", async () => {
  const navigate = vi.fn();
  render(<CandidateDashboard session={session} profile={null} onNavigate={navigate} onOpenJob={vi.fn()} />);
  await screen.findByText("Bắt đầu với CV của bạn");
  fireEvent.click(screen.getByRole("button", { name: /Đơn đã gửi/ }));
  expect(navigate).toHaveBeenCalledWith("applications");
});
