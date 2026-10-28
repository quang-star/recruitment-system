import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { CandidateProfilePage } from "./CandidateProfilePage";
import { apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { setPendingJobId } from "../../shared/pendingApplication";

vi.mock("../../shared/api/client", async (original) => ({ ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn() }));
vi.mock("./CandidateCvPanel", () => ({ CandidateCvPanel: () => <h2>Thư viện CV cá nhân</h2> }));
vi.mock("./CandidateDashboard", () => ({ CandidateDashboard: () => <h2>Tổng quan cá nhân</h2> }));
vi.mock("../auth/AccountSecurityPanel", () => ({ AccountSecurityPanel: () => <h2>Bảo mật tài khoản cá nhân</h2> }));
vi.mock("../notification/NotificationCenter", () => ({ NotificationCenter: () => <h2>Thông báo của tôi</h2> }));

const session = { userId: "candidate", accessToken: "test-token", roles: ["CANDIDATE"] } as AuthSession;
beforeEach(() => {
  setPendingJobId(null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(apiRequest).mockClear();
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/api/v2/candidates/me") return { displayName: "Nguyễn An", headline: "Developer", locationText: "Hà Nội", visibility: "APPLICATION_ONLY", version: 0 };
    if (path === "/api/v2/public/jobs?summary") return {};
    if (path.includes("/jobs?") || path.includes("/applications?")) return { items: [], total: 0, page: 0, size: 12 };
    return [];
  });
});

it("defaults signed-in candidates to the same job-first homepage and puts personal pages in the name menu", async () => {
  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  expect(screen.getByRole("heading", { name: /Tìm công việc IT/ })).toBeInTheDocument();
  const trigger = await screen.findByRole("button", { name: "Tài khoản Nguyễn An" });
  expect(screen.queryByRole("navigation", { name: "Tài khoản cá nhân" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Đăng nhập$/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Thông báo$/ })).toBeInTheDocument();
  fireEvent.click(trigger);
  const menu = screen.getByRole("navigation", { name: "Tài khoản cá nhân" });
  for (const name of ["Tổng quan", "Hồ sơ", "CV của tôi", "Việc làm đã ứng tuyển", "Bảo mật"]) {
    expect(within(menu).getByRole("button", { name })).toBeInTheDocument();
  }
  expect(within(menu).queryByRole("button", { name: "Thông báo" })).not.toBeInTheDocument();
  fireEvent.click(within(menu).getByRole("button", { name: "CV của tôi" }));
  expect(screen.getByRole("heading", { name: "Thư viện CV cá nhân" })).toBeInTheDocument();
  expect(new URLSearchParams(location.search).get("candidate")).toBe("cv");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: /^Trang chủ$/ }));
  expect(screen.getByRole("heading", { name: /Tìm công việc IT/ })).toBeInTheDocument();
});

it("opens notifications outside the account menu and supports closing the name menu with Escape", async () => {
  const user = userEvent.setup();
  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  const trigger = await screen.findByRole("button", { name: "Tài khoản Nguyễn An" });
  await user.click(trigger);
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: /^Thông báo$/ }));
  expect(screen.getByRole("heading", { name: "Thông báo của tôi" })).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Tài khoản cá nhân" })).not.toBeInTheDocument();
});

it("restores account deep links without re-opening a stale login dialog", async () => {
  window.history.replaceState(null, "", "/?auth=login&candidate=profile");
  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  expect(await screen.findByLabelText("Tên hiển thị")).toHaveValue("Nguyễn An");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("navigates from the homepage to CV management and keeps account data when returning", async () => {
  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  await screen.findByRole("button", { name: "Tài khoản Nguyễn An" });
  fireEvent.click(screen.getByRole("button", { name: /Quản lý CV của tôi/ }));
  expect(screen.getByRole("heading", { name: "Thư viện CV cá nhân" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Trang chủ$/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Tài khoản Nguyễn An" })).toBeInTheDocument());
  expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path === "/api/v2/candidates/me")).toHaveLength(1);
});

it("edits and saves expanded candidate profile contact, social links, and bio", async () => {
  window.history.replaceState(null, "", "/?candidate=profile");
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/candidates/me" && options?.method === "PUT") {
      const body = JSON.parse(options.body as string);
      return {
        ...body,
        candidateProfileId: "prof-1",
        userId: "candidate",
        version: 1
      };
    }
    if (path === "/api/v2/candidates/me") {
      return {
        candidateProfileId: "prof-1",
        userId: "candidate",
        displayName: "Nguyễn An",
        headline: "Developer",
        locationText: "Hà Nội",
        visibility: "APPLICATION_ONLY",
        phoneNumber: "0901234567",
        contactEmail: "an@example.com",
        linkedinUrl: "https://linkedin.com/in/nguyenan",
        githubUrl: "https://github.com/nguyenan",
        portfolioUrl: "https://nguyenan.dev",
        avatarUrl: "https://example.com/avatar.png",
        bio: "Senior backend developer",
        version: 0
      };
    }
    if (path === "/api/v2/public/jobs?summary") return {};
    if (path.includes("/jobs?") || path.includes("/applications?")) return { items: [], total: 0, page: 0, size: 12 };
    return [];
  });

  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  expect(await screen.findByLabelText("Tên hiển thị")).toHaveValue("Nguyễn An");
  expect(screen.getByLabelText("Số điện thoại")).toHaveValue("0901234567");
  expect(screen.getByLabelText("Email liên hệ")).toHaveValue("an@example.com");
  expect(screen.getByLabelText("LinkedIn URL")).toHaveValue("https://linkedin.com/in/nguyenan");
  expect(screen.getByLabelText("GitHub URL")).toHaveValue("https://github.com/nguyenan");
  expect(screen.getByLabelText("Portfolio / Website cá nhân")).toHaveValue("https://nguyenan.dev");
  expect(screen.getByLabelText("Giới thiệu bản thân")).toHaveValue("Senior backend developer");

  fireEvent.change(screen.getByLabelText("Số điện thoại"), { target: { value: "0988888888" } });
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật hồ sơ" }));

  await waitFor(() => {
    expect(screen.getByText("Hồ sơ đã được lưu.")).toBeInTheDocument();
  });

  const putCall = vi.mocked(apiRequest).mock.calls.find(([path, opt]) => path === "/api/v2/candidates/me" && opt?.method === "PUT");
  expect(putCall).toBeDefined();
  const payload = JSON.parse(putCall![1]!.body as string);
  expect(payload.phoneNumber).toBe("0988888888");
  expect(payload.contactEmail).toBe("an@example.com");
  expect(payload.version).toBe(0);
});
