import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError, apiRequest } from "../../../shared/api/client";
import type { AuthSession } from "../../../shared/auth/session";
import type { CandidateCvRecord } from "../CandidateCvPanel";
import CvBuilder from "./CvBuilder";
import { BODY_SECTIONS, createCvDocument, type CvDraftRecord } from "./cvDocument";
import { renderCvPdf } from "./ClassicCvDocument";

vi.mock("../../../shared/api/client", async original => ({
  ...await original<typeof import("../../../shared/api/client")>(),
  apiRequest: vi.fn(),
}));
vi.mock("./ClassicCvDocument", () => ({ renderCvPdf: vi.fn() }));

const session = { userId: "100", accessToken: "synthetic-test" } as AuthSession;
const cvs = [
  {
    cvId: "200",
    title: "CV nguồn mẫu",
    status: "ACTIVE",
    activeVersion: { cvVersionId: "300", processingStatus: "CONFIRMED" },
  },
] as CandidateCvRecord[];
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiRequest).mockReset();
  const OriginalURL = URL;
  vi.stubGlobal(
    "URL",
    class extends OriginalURL {
      static createObjectURL = vi.fn(() => "blob:synthetic-cv");
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(renderCvPdf).mockResolvedValue(new Blob(["%PDF-synthetic"], { type: "application/pdf" }));
});
afterEach(() => vi.unstubAllGlobals());

function setup(extra?: Partial<Parameters<typeof CvBuilder>[0]>) {
  return render(<CvBuilder session={session} cvs={cvs} onClose={onClose} {...extra} />);
}

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

it("updates live WYSIWYG canvas across templates, styling, section order and undo/redo, then generates and downloads PDF", async () => {
  setup();
  expect(screen.getByRole("article", { name: "Bản xem nhanh CV Modern" })).toBeInTheDocument();
  fill();
  expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Minh An");

  fireEvent.click(screen.getByRole("radio", { name: "Executive" }));
  expect(screen.getByRole("article", { name: "Bản xem nhanh CV Executive" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "↶ Hoàn tác" }));
  expect(screen.getByRole("article", { name: "Bản xem nhanh CV Modern" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "↷ Làm lại" }));
  expect(screen.getByRole("article", { name: "Bản xem nhanh CV Executive" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Màu Xanh navy" }));
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  fireEvent.click(screen.getByRole("button", { name: "Nhỏ" }));
  fireEvent.click(screen.getByRole("button", { name: "Thoáng" }));
  fireEvent.click(screen.getByRole("button", { name: "Đưa mục Kỹ năng lên" }));

  fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước PDF" }));
  const link = await screen.findByRole("link", { name: "Tải PDF" });
  expect(link).toHaveAttribute("href", "blob:synthetic-cv");
  expect(screen.getByTitle("Xem trước PDF Executive")).toHaveAttribute("src", link.getAttribute("href"));
  expect(renderCvPdf).toHaveBeenCalledWith(
    expect.objectContaining({
      templateId: "executive",
      accentColor: "#1e3a8a",
      language: "en",
      fontSize: "small",
      lineSpacing: "relaxed",
      sectionOrder: [
        "skills",
        "introduction",
        "experiences",
        "education",
        "projects",
        "certificates",
        "languages",
        "awards",
        "activities",
        "hobbies",
      ],
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa trực tiếp" }));
  fireEvent.click(screen.getByRole("button", { name: "Tải xuống PDF" }));
  await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Tên mới" } });
  expect(screen.queryByRole("link", { name: "Tải PDF" })).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-cv");
});

it("saves new drafts to server, updates existing drafts with optimistic locking and handles conflicts", async () => {
  const onDraftSaved = vi.fn();
  const baseDoc = createCvDocument();
  const serverDraft: CvDraftRecord = {
    draftId: "9007199254740993",
    candidateUserId: "100",
    title: "Nguyễn Minh An",
    templateId: "classic",
    accentColor: "#0f766e",
    sectionOrder: [...BODY_SECTIONS],
    payload: {
      fullName: "Nguyễn Minh An",
      headline: "",
      email: "",
      phone: "",
      location: "",
      links: "",
      introduction: "",
      skills: "Java, SQL",
      experiences: [],
      education: [],
      projects: [],
      certificates: [],
      languages: [],
      photoDataUrl: "",
      language: "vi",
      fontSize: "medium",
      lineSpacing: "normal",
      hiddenSections: [],
    },
    createdAt: "2026-11-14T00:00:00Z",
    updatedAt: "2026-11-14T00:00:00Z",
    version: 0,
  };
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(serverDraft)
    .mockRejectedValueOnce(
      new ApiClientError(409, {
        code: "CV_DRAFT_CONFLICT",
        message: "Conflict",
        details: {},
        correlationId: "00000000-0000-0000-0000-000000000000",
        timestamp: "2026-11-14T00:00:00Z",
      }),
    );

  setup({ onDraftSaved });
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Lưu bản nháp" }));
  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v2/cvs/drafts",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  expect(onDraftSaved).toHaveBeenCalledWith(serverDraft);
  expect(screen.getByRole("button", { name: "Cập nhật bản nháp" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Họ và tên"), { target: { value: "Nguyễn Minh Bình" } });
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật bản nháp" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("cập nhật ở nơi khác");
  expect(baseDoc.schemaVersion).toBe("cv-authoring/2.0");
});

it("uploads the generated PDF directly to the CV library with explicit external AI consent", async () => {
  const onCvUploaded = vi.fn();
  vi.mocked(apiRequest).mockResolvedValueOnce({
    cvId: "501",
    title: "CV Backend",
    status: "ACTIVE",
    version: 0,
    activeVersion: {
      cvVersionId: "601",
      originalFilename: "CV Backend.pdf",
      sizeBytes: 14,
      processingStatus: "UPLOADED",
      version: 0,
      failureCode: null,
    },
  });

  setup({ onCvUploaded });
  fireEvent.change(screen.getByLabelText("Tên bản CV"), { target: { value: "CV Backend" } });
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Lưu vào thư viện CV" }));

  const consent = await screen.findByRole("checkbox", {
    name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này",
  });
  expect(consent).not.toBeChecked();
  fireEvent.click(consent);
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận lưu vào thư viện CV" }));

  await waitFor(() =>
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v2/cvs",
      expect.objectContaining({ method: "POST" }),
    ),
  );
  const uploadCall = vi.mocked(apiRequest).mock.calls.find(([path]) => path === "/api/v2/cvs")!;
  const body = uploadCall[1]!.body as FormData;
  expect(body.get("title")).toBe("CV Backend");
  expect(body.get("externalAiConsent")).toBe("true");
  expect(body.get("externalAiPolicyVersion")).toBe("external-ai/1.0");
  expect(onCvUploaded).toHaveBeenCalledTimes(1);
});

it("keeps edits until source replacement is explicitly confirmed and shows specific limit errors", async () => {
  const validParsed = {
    cvVersionId: "300",
    status: "CONFIRMED",
    payload: { skills: [{ raw: "Python" }], experiences: [], education: [], projects: [], certificates: [], languages: [] },
  };
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(validParsed)
    .mockResolvedValueOnce(validParsed)
    .mockResolvedValueOnce({
      cvVersionId: "300",
      status: "CONFIRMED",
      payload: {
        skills: [],
        experiences: [],
        education: [],
        projects: Array.from({ length: 21 }, () => ({ name: "Dự án", description: null })),
        certificates: [],
        languages: [],
      },
    });
  setup();
  fill();
  fireEvent.click(screen.getByRole("tab", { name: "Gợi ý & Nhập" }));
  fireEvent.change(screen.getByLabelText("CV nguồn"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "Nhập nội dung CV cũ" }));
  await screen.findByRole("dialog", { name: "Áp dụng dữ liệu vào bản CV?" });
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(screen.getByLabelText("Kỹ năng")).toHaveValue("Java, SQL");

  fireEvent.click(screen.getByRole("button", { name: "Nhập nội dung CV cũ" }));
  fireEvent.click(await screen.findByRole("button", { name: "Áp dụng dữ liệu" }));
  expect(screen.getByLabelText("Kỹ năng")).toHaveValue("Python");

  fireEvent.click(screen.getByRole("button", { name: "Nhập nội dung CV cũ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("vượt giới hạn tối đa 20 mục");
});

it("applies writing suggestions, hides/shows sections and calculates completeness score", () => {
  setup();
  fireEvent.click(screen.getByRole("tab", { name: "Gợi ý & Nhập" }));
  fireEvent.click(screen.getAllByRole("button", { name: "+ Chèn" })[0]);
  expect(screen.getByLabelText("Giới thiệu")).not.toHaveValue("");

  fireEvent.click(screen.getByRole("button", { name: "Ẩn mục Chứng chỉ" }));
  expect(screen.queryByRole("button", { name: "Ẩn mục Chứng chỉ" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Bố cục mục" }));
  const certToggle = screen.getByRole("checkbox", { name: "Chứng chỉ" });
  expect(certToggle).not.toBeChecked();
  fireEvent.click(certToggle);
  expect(screen.getByRole("button", { name: "Ẩn mục Chứng chỉ" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /Hoàn thiện/ }));
  expect(screen.getByText("Mức độ hoàn thiện CV")).toBeInTheDocument();
});

it("ignores PDF completion after unmount and prevents editing while generating", async () => {
  let resolve!: (blob: Blob) => void;
  vi.mocked(renderCvPdf).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = setup();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước PDF" }));
  await waitFor(() => expect(renderCvPdf).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Họ và tên")).toBeDisabled();
  view.unmount();
  await act(async () => resolve(new Blob(["synthetic"])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("rejects invalid draft JSON without replacing current content", async () => {
  setup();
  fill();
  const file = new File(["{}"], "invalid.json", { type: "application/json" });
  Object.assign(file, { text: async () => "{}" });
  fireEvent.change(screen.getByLabelText("Mở file nháp"), { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("không hợp lệ");
  expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Minh An");
});

it("opens a valid draft only after confirmation and saves incomplete local drafts explicitly", async () => {
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
  render(
    <CvBuilder
      session={session}
      cvs={[...cvs, { ...cvs[0], cvId: "201", title: "CV chưa xác nhận", activeVersion: { ...cvs[0].activeVersion, processingStatus: "PARSED" } }]}
      onClose={onClose}
    />,
  );
  fill();
  fireEvent.click(screen.getByRole("tab", { name: "Gợi ý & Nhập" }));
  expect(screen.queryByRole("option", { name: "CV chưa xác nhận" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("CV nguồn"), { target: { value: "200" } });
  fireEvent.click(screen.getByRole("button", { name: "Nhập nội dung CV cũ" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Không lấy được dữ liệu");
  expect(screen.getByLabelText("Kỹ năng")).toHaveValue("Java, SQL");
});

it("reorders blocks via drag-and-drop and canvas controls, and switches templates from gallery", async () => {
  setup();
  fill();
  fireEvent.change(screen.getByLabelText("Giới thiệu"), { target: { value: "Giới thiệu ngắn" } });

  const dataTransfer = {
    data: {} as Record<string, string>,
    effectAllowed: "move",
    dropEffect: "move",
    setData(key: string, value: string) {
      this.data[key] = value;
    },
    getData(key: string) {
      return this.data[key] ?? "";
    },
  };

  fireEvent.click(screen.getByRole("tab", { name: "Bố cục mục" }));
  const sidebarRows = Array.from(document.querySelectorAll("aside [draggable='true']"));
  expect(sidebarRows.length).toBeGreaterThanOrEqual(2);
  fireEvent.dragStart(sidebarRows[1], { dataTransfer });
  fireEvent.dragOver(sidebarRows[0], { dataTransfer });
  fireEvent.drop(sidebarRows[0], { dataTransfer });

  fireEvent.click(screen.getAllByRole("button", { name: "Đưa mục Kỹ năng xuống" })[0]);

  fireEvent.click(screen.getByRole("tab", { name: "Thiết kế" }));
  fireEvent.click(screen.getByRole("button", { name: "Thư viện mẫu" }));
  fireEvent.click(screen.getByRole("button", { name: "Chọn màu Xanh navy cho mẫu Ấn Tượng · Minimal" }));
  fireEvent.click(screen.getByRole("button", { name: "Xem trước mẫu Ấn Tượng · Minimal" }));

  expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn Minh An");
  expect(screen.getByRole("article", { name: "Bản xem nhanh CV Minimal" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Tạo bản xem trước PDF" }));
  await waitFor(() => expect(renderCvPdf).toHaveBeenCalledWith(
    expect.objectContaining({
      templateId: "minimal",
      accentColor: "#1e3a8a",
      sectionOrder: [
        "introduction",
        "skills",
        "experiences",
        "education",
        "projects",
        "certificates",
        "languages",
        "awards",
        "activities",
        "hobbies",
      ],
    }),
  ));
});

it("supports font family, custom color, editable section heading, Phase-2 sections and Ctrl+S save", async () => {
  const onDraftSaved = vi.fn();
  const savedDraft: CvDraftRecord = {
    draftId: "888",
    candidateUserId: "100",
    title: "Nguyễn Minh An",
    templateId: "executive",
    accentColor: "#9333ea",
    sectionOrder: [...BODY_SECTIONS],
    payload: {
      fullName: "Nguyễn Minh An",
      headline: "",
      email: "",
      phone: "",
      location: "",
      links: "",
      introduction: "",
      skills: "TypeScript",
      experiences: [],
      education: [],
      projects: [],
      certificates: [],
      languages: [],
    },
    createdAt: "2026-11-14T00:00:00Z",
    updatedAt: "2026-11-14T00:00:00Z",
    version: 0,
  };
  vi.mocked(apiRequest).mockResolvedValue(savedDraft);

  render(<CvBuilder session={session} cvs={cvs} onDraftSaved={onDraftSaved} onClose={onClose} />);
  fill();

  fireEvent.click(screen.getByRole("button", { name: "Noto Serif (Cổ điển)" }));
  fireEvent.change(screen.getByLabelText("Màu chủ đạo tùy chỉnh"), { target: { value: "#9333ea" } });

  fireEvent.click(screen.getByRole("button", { name: "+ Thêm mục giải thưởng" }));
  fireEvent.change(screen.getByLabelText("Tiêu đề mục Giải thưởng"), { target: { value: "THÀNH TÍCH NỔI BẬT" } });
  fireEvent.change(screen.getByLabelText("THÀNH TÍCH NỔI BẬT 1 - Tiêu đề"), { target: { value: "Giải Nhất CodeFest" } });

  fireEvent.keyDown(window, { key: "s", ctrlKey: true });

  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
    "/api/v2/cvs/drafts",
    expect.objectContaining({ method: "POST" }),
  ));
  const postedBody = JSON.parse((vi.mocked(apiRequest).mock.calls[0][1] as { body: string }).body);
  expect(postedBody.accentColor).toBe("#9333ea");
  expect(postedBody.payload.fontFamily).toBe("serif");
  expect(postedBody.payload.sectionTitles).toEqual({ awards: "THÀNH TÍCH NỔI BẬT" });
  expect(postedBody.payload.awards).toHaveLength(1);
  expect(onDraftSaved).toHaveBeenCalledWith(savedDraft);
});
