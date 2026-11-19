import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { CandidateProfilePage } from "./CandidateProfilePage";
import { ApiClientError, apiDownload, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { setPendingJobId } from "../../shared/pendingApplication";

vi.mock("../../shared/api/client", async (original) => ({ ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn(), apiDownload: vi.fn() }));
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
    if (path === "/api/v2/public/jobs/discovery") return { locations: [], categories: [] };
    if (path === "/api/v2/public/jobs?summary") return {};
    if (path.includes("/jobs?") || path.includes("/applications?")) return { items: [], total: 0, page: 0, size: 12 };
    return [];
  });
});

it("defaults signed-in candidates to the same job-first homepage and puts personal pages in the name menu", async () => {
  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  expect(screen.getByRole("form", { name: "Tìm cơ hội nghề nghiệp" })).toBeInTheDocument();
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
  expect(window.location.pathname).toBe("/candidate/cv");
  expect(screen.getByRole("button", { name: /^Thông báo$/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Tìm việc làm$/ })).toBeVisible();
  expect(screen.getByRole("button", { name: /^Công ty$/ })).toBeVisible();
  expect(screen.queryByRole("button", { name: /^Đối chiếu CV–JD$/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Tài khoản cá nhân" })).not.toBeInTheDocument();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Trang chủ cổng tuyển dụng" }));
  expect(screen.getByRole("form", { name: "Tìm cơ hội nghề nghiệp" })).toBeInTheDocument();
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
  fireEvent.click(screen.getByRole("button", { name: "Trang chủ cổng tuyển dụng" }));
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
  expect(payload.avatarUrl).toBe("https://example.com/avatar.png");
  expect(within(screen.getByRole("button", { name: "Tài khoản Nguyễn An" })).getByRole("presentation")).toHaveAttribute("src", "https://example.com/avatar.png");
  expect(payload.phoneNumber).toBe("0988888888");
  expect(payload.contactEmail).toBe("an@example.com");
  expect(payload.version).toBe(0);
});

it("uploads an account avatar and shows it in the account menu", async () => {
  window.history.replaceState(null, "", "/?candidate=profile");
  const imageUrl = "/api/v2/candidates/me/avatar/123e4567-e89b-12d3-a456-426614174000";
  const createUrl = vi.fn(() => "blob:avatar");
  const revokeUrl = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  vi.mocked(apiDownload).mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "avatar.png" });
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.startsWith("/api/v2/candidates/me/avatar?")) return { displayName: "Nguyễn An", headline: "Developer", locationText: "Hà Nội", visibility: "APPLICATION_ONLY", version: 1, avatarUrl: imageUrl };
    if (path === "/api/v2/candidates/me") return { displayName: "Nguyễn An", headline: "Developer", locationText: "Hà Nội", visibility: "APPLICATION_ONLY", version: 0 };
    if (path.includes("/jobs?") || path.includes("/applications?")) return { items: [], total: 0, page: 0, size: 12 };
    return [];
  });
  const view = render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  const input = await screen.findByLabelText("Ảnh đại diện");
  const file = new File(["image"], "avatar.png", { type: "image/png" });
  await userEvent.upload(input, file);
  await screen.findByText("Ảnh đại diện đã được cập nhật.");
  await waitFor(() => expect(within(screen.getByRole("button", { name: "Tài khoản Nguyễn An" })).getByRole("presentation")).toHaveAttribute("src", "blob:avatar"));
  const upload = vi.mocked(apiRequest).mock.calls.find(([path]) => path.startsWith("/api/v2/candidates/me/avatar?"));
  expect(upload?.[0]).toContain("version=0");
  expect((upload?.[1]?.body as FormData).get("file")).toBe(file);
  view.unmount();
  expect(revokeUrl).toHaveBeenCalledWith("blob:avatar");
  vi.unstubAllGlobals();
});

it("renders /candidate/cv directly without fetching public portal endpoints", async () => {
  window.history.replaceState({}, "", "/candidate/cv");
  render(
    <CandidateProfilePage
      session={{
        userId: "user-1",
        accessToken: "token-1",
        refreshToken: "refresh-1",
        accessTokenExpiresAt: "2030-01-01T00:00:00Z",
        refreshTokenExpiresAt: "2030-01-02T00:00:00Z",
        roles: ["CANDIDATE"]
      }}
      onLogout={() => {}}
    />
  );

  expect(await screen.findByRole("heading", { name: "Thư viện CV cá nhân" })).toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => typeof path === "string" && path.startsWith("/api/v2/public/"))).toBe(false);
});

it("keeps the normal portal heading on candidate account pages instead of switching to a workspace header", async () => {
  window.history.replaceState({}, "", "/candidate/profile");
  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);

  expect(await screen.findByRole("heading", { name: "Hồ sơ ứng viên", level: 1 })).toBeInTheDocument();
  const headerNav = screen.getByRole("navigation", { name: "Điều hướng chính" });
  expect(within(headerNav).getByRole("button", { name: "Tìm việc làm" })).toBeInTheDocument();
  expect(within(headerNav).getByRole("button", { name: "Công ty" })).toBeInTheDocument();
  expect(within(headerNav).queryByRole("button", { name: "Đối chiếu CV–JD" })).not.toBeInTheDocument();
  expect(within(headerNav).queryByRole("button", { name: "Tổng quan" })).not.toBeInTheDocument();
  expect(within(headerNav).queryByRole("button", { name: "Hồ sơ" })).not.toBeInTheDocument();
  expect(within(headerNav).queryByRole("button", { name: "Bảo mật" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tài khoản Nguyễn An" })).toBeInTheDocument();
});

it("preserves unsaved profile edits when the access token refreshes for the same user", async () => {
  window.history.replaceState({}, "", "/candidate/profile");
  const onLogout = vi.fn();
  const { rerender } = render(<CandidateProfilePage session={session} onLogout={onLogout} />);

  const input = await screen.findByLabelText("Tên hiển thị");
  fireEvent.change(input, { target: { value: "Unsaved refresh draft" } });

  rerender(
    <CandidateProfilePage
      session={{ ...session, accessToken: "rotated-token" }}
      onLogout={onLogout}
    />
  );

  await waitFor(() => {
    expect(screen.getByLabelText("Tên hiển thị")).toHaveValue("Unsaved refresh draft");
  });
  expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path === "/api/v2/candidates/me")).toHaveLength(1);
});

it("treats missing initial profile (404) as empty without error and creates profile with version null", async () => {
  window.history.replaceState({}, "", "/candidate/profile");
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/candidates/me" && options?.method === "PUT") {
      const body = JSON.parse(options.body as string);
      return { ...body, candidateProfileId: "prof-new", userId: "candidate", version: 0 };
    }
    if (path === "/api/v2/candidates/me") {
      throw new ApiClientError(404, { code: "CANDIDATE_PROFILE_NOT_FOUND", message: "Candidate profile was not found", details: {}, correlationId: "c1", timestamp: "2026-11-18T10:00:00Z" });
    }
    if (path === "/api/v2/public/jobs?summary") return {};
    if (path.includes("/jobs?") || path.includes("/applications?")) return { items: [], total: 0, page: 0, size: 12 };
    return [];
  });

  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  const nameInput = await screen.findByLabelText("Tên hiển thị");
  expect(nameInput).toHaveValue("");
  expect(screen.queryByText(/Candidate profile was not found/)).not.toBeInTheDocument();

  fireEvent.change(nameInput, { target: { value: "Trần Minh" } });
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật hồ sơ" }));

  await waitFor(() => {
    expect(screen.getByText("Hồ sơ đã được lưu.")).toBeInTheDocument();
  });

  const putCall = vi.mocked(apiRequest).mock.calls.find(([path, opt]) => path === "/api/v2/candidates/me" && opt?.method === "PUT");
  expect(putCall).toBeDefined();
  expect(JSON.parse(putCall![1]!.body as string).version).toBeNull();
});

it("supports drag-and-drop avatar upload and removing an existing avatar", async () => {
  window.history.replaceState(null, "", "/candidate/profile");
  const imageUrl = "/api/v2/candidates/me/avatar/123e4567-e89b-12d3-a456-426614174000";
  const createUrl = vi.fn(() => "blob:dropped-avatar");
  const revokeUrl = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  vi.mocked(apiDownload).mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "avatar.png" });
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path.startsWith("/api/v2/candidates/me/avatar?")) {
      return { displayName: "Nguyễn An", headline: "Developer", locationText: "Hà Nội", visibility: "APPLICATION_ONLY", version: 1, avatarUrl: imageUrl };
    }
    if (path === "/api/v2/candidates/me" && options?.method === "PUT") {
      const body = JSON.parse(options.body as string);
      return { ...body, candidateProfileId: "prof-1", userId: "candidate", version: 2 };
    }
    if (path === "/api/v2/candidates/me") {
      return { displayName: "Nguyễn An", headline: "Developer", locationText: "Hà Nội", visibility: "APPLICATION_ONLY", version: 0 };
    }
    if (path.includes("/jobs?") || path.includes("/applications?")) return { items: [], total: 0, page: 0, size: 12 };
    return [];
  });

  try {
    render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
    const dropzone = await screen.findByTestId("candidate-avatar-dropzone");
    const file = new File(["image"], "photo.png", { type: "image/png" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await screen.findByText("Ảnh đại diện đã được cập nhật.");
    await waitFor(() =>
      expect(within(screen.getByRole("button", { name: "Tài khoản Nguyễn An" })).getByRole("presentation")).toHaveAttribute("src", "blob:dropped-avatar")
    );

    fireEvent.click(screen.getByRole("button", { name: "Xóa ảnh" }));
    await screen.findByText("Ảnh đại diện đã được xóa.");

    const putCall = vi.mocked(apiRequest).mock.calls.find(([path, opt]) => path === "/api/v2/candidates/me" && opt?.method === "PUT");
    expect(putCall).toBeDefined();
    const payload = JSON.parse(putCall![1]!.body as string);
    expect(payload.avatarUrl).toBeNull();
    expect(payload.version).toBe(1);
    expect(screen.queryByRole("button", { name: "Xóa ảnh" })).not.toBeInTheDocument();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("auto-creates profile when uploading avatar with displayName on an empty account and requires displayName when blank", async () => {
  window.history.replaceState({}, "", "/candidate/profile");
  const imageUrl = "/api/v2/candidates/me/avatar/123e4567-e89b-12d3-a456-426614174000";
  const createUrl = vi.fn(() => "blob:new-profile-avatar");
  const revokeUrl = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  vi.mocked(apiDownload).mockResolvedValue({ blob: new Blob(["image"], { type: "image/png" }), filename: "avatar.png" });
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path.startsWith("/api/v2/candidates/me/avatar?")) {
      return { displayName: "Trần Minh", headline: null, locationText: null, visibility: "APPLICATION_ONLY", version: 1, avatarUrl: imageUrl };
    }
    if (path === "/api/v2/candidates/me" && options?.method === "PUT") {
      const body = JSON.parse(options.body as string);
      return { ...body, candidateProfileId: "prof-new", userId: "candidate", version: 0 };
    }
    if (path === "/api/v2/candidates/me") {
      throw new ApiClientError(404, { code: "CANDIDATE_PROFILE_NOT_FOUND", message: "Candidate profile was not found", details: {}, correlationId: "c1", timestamp: "2026-11-18T10:00:00Z" });
    }
    if (path.includes("/jobs?") || path.includes("/applications?")) return { items: [], total: 0, page: 0, size: 12 };
    return [];
  });

  try {
    render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
    const input = await screen.findByLabelText("Ảnh đại diện");
    const file = new File(["image"], "avatar.png", { type: "image/png" });
    await userEvent.upload(input, file);

    await screen.findByText("Vui lòng nhập Tên hiển thị trước khi tải ảnh đại diện.");
    expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.startsWith("/api/v2/candidates/me/avatar?"))).toBe(false);

    fireEvent.change(screen.getByLabelText("Tên hiển thị"), { target: { value: "Trần Minh" } });
    await userEvent.upload(input, file);

    await screen.findByText("Ảnh đại diện đã được cập nhật.");
    await waitFor(() =>
      expect(within(screen.getByRole("button", { name: "Tài khoản Trần Minh" })).getByRole("presentation")).toHaveAttribute("src", "blob:new-profile-avatar")
    );
    const putCall = vi.mocked(apiRequest).mock.calls.find(([path, opt]) => path === "/api/v2/candidates/me" && opt?.method === "PUT");
    const uploadCall = vi.mocked(apiRequest).mock.calls.find(([path]) => path.startsWith("/api/v2/candidates/me/avatar?"));
    expect(putCall).toBeDefined();
    expect(JSON.parse(putCall![1]!.body as string).version).toBeNull();
    expect(uploadCall?.[0]).toContain("version=0");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("rejects unsupported avatar file formats before calling the API", async () => {
  window.history.replaceState({}, "", "/candidate/profile");
  render(<CandidateProfilePage session={session} onLogout={vi.fn()} />);
  const dropzone = await screen.findByTestId("candidate-avatar-dropzone");
  const badFile = new File(["image"], "avatar.webp", { type: "image/webp" });
  fireEvent.drop(dropzone, { dataTransfer: { files: [badFile] } });

  await screen.findByText("Chọn ảnh JPEG hoặc PNG có dung lượng tối đa 2 MB.");
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.startsWith("/api/v2/candidates/me/avatar?"))).toBe(false);
});
