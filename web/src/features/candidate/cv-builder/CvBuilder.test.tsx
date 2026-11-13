import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/client";
import type { AuthSession } from "../../../shared/auth/session";
import type { CandidateCvRecord } from "../CandidateCvPanel";
import CvBuilder from "./CvBuilder";
import { createCvDocument } from "./cvDocument";
import { renderCvPdf } from "./ClassicCvDocument";

vi.mock("../../../shared/api/client", async original => ({ ...await original<typeof import("../../../shared/api/client")>(), apiRequest: vi.fn() }));
vi.mock("./ClassicCvDocument", () => ({ renderCvPdf: vi.fn() }));
const session = { userId: "100", accessToken: "synthetic-test" } as AuthSession;
const cvs = [{ cvId: "200", title: "CV nguồn mẫu", status: "ACTIVE", activeVersion: { cvVersionId: "300", processingStatus: "CONFIRMED" } }] as CandidateCvRecord[];
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  const OriginalURL = URL;
  vi.stubGlobal("URL", class extends OriginalURL {
    static createObjectURL = vi.fn(() => "blob:synthetic-cv");
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(renderCvPdf).mockResolvedValue(new Blob(["%PDF-synthetic"], { type: "application/pdf" }));
});
afterEach(() => vi.unstubAllGlobals());

function setup() { return render(<CvBuilder session={session} cvs={cvs} onClose={onClose} />); }
function fill() {
  fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Nguyễn Minh An" } });
  fireEvent.change(screen.getByLabelText("Kỹ năng"), { target: { value: "Java, SQL" } });
}

it("requires useful content and guards closing an unsaved editable draft", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước PDF" }));
  expect(screen.getByRole("alert")).toHaveTextContent("nhập họ tên");
  expect(renderCvPdf).not.toHaveBeenCalled();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Đóng trình tạo CV" }));
  expect(screen.getByRole("dialog", { name: "Đóng bản CV đang chỉnh sửa?" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Minh An");
  expect(onClose).not.toHaveBeenCalled();
});

it("generates once, previews and downloads identical bytes, then invalidates on edit", async () => {
  setup(); fill();
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước PDF" }));
  const link = await screen.findByRole("link", { name: "Tải PDF" });
  expect(link).toHaveAttribute("href", "blob:synthetic-cv");
  expect(screen.getByTitle("Xem trước CV Classic")).toHaveAttribute("src", link.getAttribute("href"));
  fireEvent.click(link); fireEvent.click(link);
  expect(renderCvPdf).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Tên mới" } });
  expect(screen.queryByRole("link", { name: "Tải PDF" })).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-cv");
});

it("keeps edits until source replacement is explicitly confirmed and never updates old CV", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ cvVersionId: "300", status: "CONFIRMED", payload: { skills: [{ raw: "Python" }], experiences: [], education: [], projects: [], certificates: [], languages: [] } });
  setup(); fill();
  fireEvent.change(screen.getByLabelText("CV nguồn"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "Nhập nội dung CV cũ" }));
  await screen.findByRole("dialog", { name: "Áp dụng dữ liệu vào bản CV?" });
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(screen.getByLabelText("Kỹ năng")).toHaveValue("Java, SQL");
  fireEvent.click(screen.getByRole("button", { name: "Nhập nội dung CV cũ" }));
  fireEvent.click(await screen.findByRole("button", { name: "Áp dụng dữ liệu" }));
  expect(screen.getByLabelText("Kỹ năng")).toHaveValue("Python");
  expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Minh An");
  expect(screen.getByRole("status")).toHaveTextContent("tên công ty, trường học");
  expect(vi.mocked(apiRequest).mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it("ignores PDF completion after unmount and prevents editing while generating", async () => {
  let resolve!: (blob: Blob) => void;
  vi.mocked(renderCvPdf).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = setup(); fill();
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước PDF" }));
  await waitFor(() => expect(renderCvPdf).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Họ và tên")).toBeDisabled();
  view.unmount();
  await act(async () => resolve(new Blob(["synthetic"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("rejects invalid draft JSON without replacing current content", async () => {
  setup(); fill();
  const file = new File(["{}"], "invalid.json", { type: "application/json" });
  Object.assign(file, { text: async () => "{}" });
  fireEvent.change(screen.getByLabelText("Mở file nháp"), { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("không hợp lệ");
  expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Minh An");
});

it("opens a valid draft only after confirmation and saves incomplete drafts explicitly", async () => {
  setup();
  fireEvent.click(screen.getByRole("button", { name: "Tải file nháp" }));
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  const draft = { ...createCvDocument(), fullName: "Người dùng file nháp" };
  const json = JSON.stringify(draft);
  const file = new File([json], "draft.cv.json", { type: "application/json" });
  Object.assign(file, { text: async () => json });
  fireEvent.change(screen.getByLabelText("Mở file nháp"), { target: { files: [file] } });
  fireEvent.click(await screen.findByRole("button", { name: "Áp dụng dữ liệu" }));
  expect(screen.getByLabelText("Họ và tên")).toHaveValue(draft.fullName);
  fireEvent.click(screen.getByRole("button", { name: "Đóng trình tạo CV" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("keeps form data when source fetch fails and filters unconfirmed CVs", async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error("offline"));
  render(<CvBuilder session={session} cvs={[...cvs, { ...cvs[0], cvId: "201", title: "CV chưa xác nhận", activeVersion: { ...cvs[0].activeVersion, processingStatus: "PARSED" } }]} onClose={onClose} />);
  expect(screen.queryByRole("option", { name: "CV chưa xác nhận" })).not.toBeInTheDocument();
  fill();
  fireEvent.change(screen.getByLabelText("CV nguồn"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "Nhập nội dung CV cũ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Không lấy được dữ liệu");
  expect(screen.getByLabelText("Kỹ năng")).toHaveValue("Java, SQL");
});
