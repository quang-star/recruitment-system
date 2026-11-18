import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { RecruiterWorkspace } from "./RecruiterWorkspace";

vi.mock("../../shared/api/client", async (original) => ({
  ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn()
}));
vi.mock("./CompanyAccessPanel", () => ({ CompanyAccessPanel: () => null }));
vi.mock("./RecruiterJobBoard", () => ({ RecruiterJobBoard: () => null }));
vi.mock("../system/DashboardPanel", () => ({ DashboardPanel: () => null }));
vi.mock("../notification/NotificationCenter", () => ({ NotificationCenter: () => null }));
vi.mock("../auth/AccountSecurityPanel", () => ({ AccountSecurityPanel: () => null }));

const session = { userId: "1", accessToken: "test-token", roles: ["RECRUITER"] } as AuthSession;
const company = {
  companyId: "20", legalName: "Example", displayName: "Example", slug: "example",
  description: null, websiteUrl: null, countryCode: "VN", registrationNumber: null,
  sizeRange: null, logoUrl: null, coverImageUrl: null, status: "ACTIVE",
  verificationStatus: "UNVERIFIED", createdByUserId: "1", version: 4
};

beforeEach(() => {
  window.history.replaceState(null, "", "/recruiter/company");
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path === "/api/v2/recruiter/profile") return { userId: "1", displayName: "Recruiter", version: 0 };
    if (path === "/api/v2/companies") return [company];
    if (path === "/api/v2/companies/20/members") return [{ userId: "1", status: "ACTIVE", role: "OWNER" }];
    return [];
  });
});

it("uploads company images and keeps unsaved form changes while advancing the version", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/companies/20/images/logo?version=4") {
      expect(options?.body).toBeInstanceOf(FormData);
      expect((options?.body as FormData).get("file")).toBeInstanceOf(File);
      return { ...company, version: 5, logoUrl: "/api/v2/public/companies/20/images/logo/new" };
    }
    if (path === "/api/v2/companies/20" && options?.method === "PUT") {
      const payload = JSON.parse(options.body as string);
      expect(payload.version).toBe(5);
      expect(payload.displayName).toBe("Edited company");
      expect(payload.logoUrl).toBe("/api/v2/public/companies/20/images/logo/new");
      return { ...company, ...payload, version: 6 };
    }
    if (path === "/api/v2/recruiter/profile") return { userId: "1", displayName: "Recruiter", version: 0 };
    if (path === "/api/v2/companies") return [company];
    if (path === "/api/v2/companies/20/members") return [{ userId: "1", status: "ACTIVE", role: "OWNER" }];
    return [];
  });
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  const upload = await screen.findByLabelText("Tải logo lên");
  await waitFor(() => expect(upload).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Tên hiển thị"), { target: { value: "Edited company" } });
  fireEvent.change(upload, { target: { files: [new File(["png"], "logo.png", { type: "image/png" })] } });
  expect(await screen.findByText("Logo công ty đã được cập nhật.")).toBeInTheDocument();
  expect(screen.getByLabelText("Tên hiển thị")).toHaveValue("Edited company");
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật công ty" }));
  expect(await screen.findByText("Thông tin công ty đã được cập nhật.")).toBeInTheDocument();
});

it("rejects invalid files and requires a saved company before upload", async () => {
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  const upload = await screen.findByLabelText("Tải ảnh bìa lên");
  await waitFor(() => expect(upload).toBeEnabled());
  fireEvent.change(upload, { target: { files: [new File(["gif"], "cover.gif", { type: "image/gif" })] } });
  expect(screen.getByText("Chọn ảnh JPEG hoặc PNG có dung lượng tối đa 2 MB.")).toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.includes("/images/"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo công ty mới" }));
  expect(screen.getByLabelText("Tải ảnh bìa lên")).toBeDisabled();
  expect(screen.getByText("Tạo công ty trước để tải logo và ảnh bìa lên.")).toBeInTheDocument();
});

it("prevents switching companies or editing the form while a cover upload is in progress", async () => {
  let finishUpload!: (value: unknown) => void;
  const pendingUpload = new Promise<unknown>((resolve) => { finishUpload = resolve; });
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation((path, options) => {
    if (path === "/api/v2/companies/20/images/cover?version=4") return pendingUpload;
    return original(path, options);
  });
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  const upload = await screen.findByLabelText("Tải ảnh bìa lên");
  await waitFor(() => expect(upload).toBeEnabled());
  fireEvent.change(upload, { target: { files: [new File(["png"], "cover.png", { type: "image/png" })] } });
  expect(screen.getByRole("button", { name: "+ Tạo công ty mới" })).toBeDisabled();
  expect(screen.getByLabelText("URL Ảnh bìa / Banner")).toBeDisabled();
  expect(screen.getByRole("button", { name: /Example/ })).toBeDisabled();
  finishUpload({ ...company, version: 5, coverImageUrl: "/api/v2/public/companies/20/images/cover/new" });
  expect(await screen.findByText("Ảnh bìa công ty đã được cập nhật.")).toBeInTheDocument();
  expect(screen.getByLabelText("URL Ảnh bìa / Banner")).toHaveValue("/api/v2/public/companies/20/images/cover/new");
});

it("shows a dropped logo immediately and restores the saved preview if upload fails", async () => {
  let rejectUpload!: (reason: Error) => void;
  const pendingUpload = new Promise<never>((_, reject) => { rejectUpload = reject; });
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation((path, options) => {
    if (path === "/api/v2/companies") return Promise.resolve([{ ...company, logoUrl: "/logos/previous.png" }]);
    if (path === "/api/v2/companies/20/images/logo?version=4") return pendingUpload;
    return original(path, options);
  });
  const createObjectURL = vi.fn(() => "blob:logo-preview");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
  try {
    const { unmount } = render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
    const upload = await screen.findByLabelText("Tải logo lên");
    await waitFor(() => expect(upload).toBeEnabled());
    const preview = screen.getByAltText("Xem trước logo công ty");
    expect(preview).toHaveAttribute("src", "/logos/previous.png");
    const file = new File(["png"], "logo.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("company-image-drop-logo"), { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(preview).toHaveAttribute("src", "blob:logo-preview"));
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
      "/api/v2/companies/20/images/logo?version=4", expect.objectContaining({ method: "POST" })
    );
    rejectUpload(new Error("Upload failed"));
    await waitFor(() => expect(preview).toHaveAttribute("src", "/logos/previous.png"));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:logo-preview");
    unmount();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("does not upload dropped files when the company is unsaved or another upload is in progress", async () => {
  let finishUpload!: (value: unknown) => void;
  const pendingUpload = new Promise<unknown>((resolve) => { finishUpload = resolve; });
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation((path, options) => {
    if (path === "/api/v2/companies/20/images/cover?version=4") return pendingUpload;
    return original(path, options);
  });
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: vi.fn(() => "blob:cover-preview"), revokeObjectURL: vi.fn()
  }));
  try {
    const { unmount } = render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
    const upload = await screen.findByLabelText("Tải ảnh bìa lên");
    await waitFor(() => expect(upload).toBeEnabled());
    const file = new File(["png"], "cover.png", { type: "image/png" });
    fireEvent.drop(screen.getByTestId("company-image-drop-cover"), { dataTransfer: { files: [file], types: ["Files"] } });
    expect(await screen.findByAltText("Xem trước ảnh bìa công ty")).toHaveAttribute("src", "blob:cover-preview");
    fireEvent.drop(screen.getByTestId("company-image-drop-logo"), { dataTransfer: { files: [file], types: ["Files"] } });
    expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path.includes("/images/"))).toHaveLength(1);
    finishUpload({ ...company, version: 5, coverImageUrl: "/api/v2/public/companies/20/images/cover/new" });
    await screen.findByText("Ảnh bìa công ty đã được cập nhật.");
    fireEvent.click(screen.getByRole("button", { name: "+ Tạo công ty mới" }));
    fireEvent.drop(screen.getByTestId("company-image-drop-logo"), { dataTransfer: { files: [file], types: ["Files"] } });
    expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path.includes("/images/"))).toHaveLength(1);
    unmount();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("rejects invalid or multiple dropped files without uploading", async () => {
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  const upload = await screen.findByLabelText("Tải logo lên");
  await waitFor(() => expect(upload).toBeEnabled());
  const zone = screen.getByTestId("company-image-drop-logo");
  const invalid = new File(["gif"], "logo.gif", { type: "image/gif" });
  fireEvent.drop(zone, { dataTransfer: { files: [invalid], types: ["Files"] } });
  expect(screen.getByText("Chọn ảnh JPEG hoặc PNG có dung lượng tối đa 2 MB.")).toBeInTheDocument();
  const image = new File(["png"], "logo.png", { type: "image/png" });
  fireEvent.drop(zone, { dataTransfer: { files: [image, image], types: ["Files"] } });
  expect(screen.getByText("Vui lòng chọn một ảnh mỗi lần tải lên.")).toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.includes("/images/"))).toBe(false);
});

it("does not upload dropped images without company management permission", async () => {
  const original = vi.mocked(apiRequest).getMockImplementation()!;
  vi.mocked(apiRequest).mockImplementation((path, options) => {
    if (path === "/api/v2/companies/20/members") {
      return Promise.resolve([{ userId: "1", status: "ACTIVE", role: "VIEWER" }]);
    }
    return original(path, options);
  });
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  const upload = await screen.findByLabelText("Tải logo lên");
  await waitFor(() => expect(upload).toBeDisabled());
  const image = new File(["png"], "logo.png", { type: "image/png" });
  fireEvent.drop(screen.getByTestId("company-image-drop-logo"), { dataTransfer: { files: [image], types: ["Files"] } });
  expect(vi.mocked(apiRequest).mock.calls.some(([path]) => path.includes("/images/"))).toBe(false);
});

it("separates company status from verificationStatus and switches company sub-tabs", async () => {
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  expect(await screen.findByText(/Trạng thái: Đang hoạt động \(ACTIVE\)/)).toBeInTheDocument();
  expect(screen.getByText(/Xác minh pháp lý: Chưa xác minh \(UNVERIFIED\)/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ứng viên" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cài đặt" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Pháp lý & Xác minh" }));
  expect(screen.getByLabelText("Tên pháp lý")).toBeDisabled();
  expect(screen.getByLabelText("Mã đăng ký")).toBeDisabled();
});

it("omits the redundant top page heading banner across recruiter views", async () => {
  window.history.replaceState(null, "", "/recruiter");
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  expect(await screen.findByRole("navigation", { name: "Điều hướng chức năng" })).toBeInTheDocument();
  expect(screen.queryByText("Không gian nhà tuyển dụng")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Tin tuyển dụng" }));
  expect(screen.queryByText("Không gian nhà tuyển dụng")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Công ty & Đội ngũ" }));
  expect(await screen.findByRole("heading", { name: "Công ty của tôi" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Cài đặt" }));
  expect(await screen.findByRole("heading", { name: "Hồ sơ recruiter" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
});

it("opens the sidebar Tài khoản popover to navigate to security and logout", async () => {
  const onLogout = vi.fn();
  window.history.replaceState(null, "", "/recruiter");
  render(<RecruiterWorkspace session={session} onLogout={onLogout} />);
  const accountTrigger = await screen.findByRole("button", { name: "Tài khoản" });
  expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();

  fireEvent.click(accountTrigger);
  expect(screen.getByText("Recruiter")).toBeInTheDocument();
  expect(screen.getByText("Nhà tuyển dụng")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Bảo mật tài khoản" }));
  expect(await screen.findByRole("button", { name: "Bảo mật tài khoản" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Tài khoản" }));
  fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
  expect(onLogout).toHaveBeenCalledOnce();
});

it("opens the company team tab directly when /recruiter/company?tab=team is requested", async () => {
  window.history.replaceState(null, "", "/recruiter/company?tab=team");
  render(<RecruiterWorkspace session={session} onLogout={vi.fn()} />);
  expect(await screen.findByRole("button", { name: "Thành viên & Phân quyền" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Tên hiển thị")).not.toBeInTheDocument();
});

