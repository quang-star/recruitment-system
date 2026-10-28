import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CandidateCvPanel } from "./CandidateCvPanel";
import { apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

vi.mock("../../shared/api/client", async (original) => ({ ...await original<typeof import("../../shared/api/client")>(), apiRequest: vi.fn(), apiDownload: vi.fn(() => new Promise(() => {})) }));
const session = { accessToken: "test", roles: ["CANDIDATE"] } as AuthSession;
const cv = { cvId: "cv", title: "Backend CV", status: "ACTIVE", version: 0, activeVersion: { cvVersionId: "version", originalFilename: "cv.pdf", sizeBytes: 1024, processingStatus: "PARSED", version: 1, failureCode: null } };
const review = { revisionId: "rev-1", revisionNumber: 1, cvVersionId: "version", status: "PARSED", payload: { skills: [{ raw: "Java", evidenceIds: [] }], experiences: [], education: [], languages: [], projects: [], certificates: [], summary: { totalExperienceMonths: 0, overallConfidence: .8, qualityFlags: [] } } };
beforeEach(() => {
  vi.mocked(apiRequest).mockClear();
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/cvs") return [cv];
    if (options?.method === "PUT") return { ...review, revisionId: "rev-2", payload: JSON.parse(options.body as string).payload };
    if (path.endsWith("/confirm")) return { ...review, revisionId: "rev-2", status: "CONFIRMED" };
    return structuredClone(review);
  });
});

it("requires saving edited content before confirming and sends the new revision", async () => {
  render(<CandidateCvPanel session={session} />);
  fireEvent.click(await screen.findByRole("button", { name: "Xem bản phân tích" }));
  fireEvent.change(await screen.findByLabelText("Kỹ năng 1"), { target: { value: "TypeScript" } });
  expect(screen.getByRole("button", { name: "Xác nhận bản phân tích" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Xác nhận bản phân tích" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận bản phân tích" }));
  await waitFor(() => expect(vi.mocked(apiRequest)).toHaveBeenCalledWith("/api/v2/parsed-cvs/version/confirm", expect.objectContaining({ body: JSON.stringify({ expectedRevisionId: "rev-2" }) })));
  expect(await screen.findByText("Đã xác nhận")).toBeInTheDocument();
  expect(screen.getByLabelText("Kỹ năng 1")).toBeDisabled();
});

it("keeps unsaved edits when the user tries to close the review", async () => {
  render(<CandidateCvPanel session={session} />);
  fireEvent.click(await screen.findByRole("button", { name: "Xem bản phân tích" }));
  fireEvent.change(await screen.findByLabelText("Kỹ năng 1"), { target: { value: "React" } });
  fireEvent.click(screen.getByRole("button", { name: "Đóng bản phân tích" }));
  expect(screen.getByRole("alert")).toHaveTextContent("thay đổi chưa lưu");
  expect(screen.getByLabelText("Kỹ năng 1")).toHaveValue("React");
});

it("rejects empty files before sending an upload request", async () => {
  render(<CandidateCvPanel session={session} />);
  await screen.findByText("Backend CV");
  fireEvent.change(screen.getByLabelText("File PDF (tối đa 10 MiB)"), { target: { files: [new File([], "empty.pdf", { type: "application/pdf" })] } });
  fireEvent.submit(screen.getByRole("form", { name: "Tải CV mới" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("phải có nội dung");
  expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("requires confirmation before deletion and ignores a review arriving after deletion", async () => {
  let resolveReview!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (path === "/api/v2/cvs") return [cv];
    if (options?.method === "DELETE") return { status: "ERASURE_REQUESTED" };
    return new Promise((resolve) => { resolveReview = resolve; });
  });
  render(<CandidateCvPanel session={session} />);
  fireEvent.click(await screen.findByRole("button", { name: "Xem bản phân tích" }));
  fireEvent.click(screen.getByRole("button", { name: "Xóa CV" }));
  expect(screen.getByRole("dialog", { name: "Xóa CV" })).toBeVisible();
  expect(vi.mocked(apiRequest).mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Xác nhận xóa CV" }));
  await waitFor(() => expect(screen.queryByText("Backend CV")).not.toBeInTheDocument());
  resolveReview(review);
  await waitFor(() => expect(screen.queryByLabelText("Kỹ năng 1")).not.toBeInTheDocument());
  expect(vi.mocked(apiRequest)).toHaveBeenCalledWith("/api/v2/cvs/cv?version=0", expect.objectContaining({ method: "DELETE" }));
});

it.each([false, true])("uploads only the explicit external AI choice (%s) and clears it after upload", async (consented) => {
  vi.mocked(apiRequest).mockImplementation(async (path, options) => {
    if (options?.method === "POST") return { ...cv, cvId: "new-cv" };
    return path === "/api/v2/cvs" ? [cv] : review;
  });
  render(<CandidateCvPanel session={session} />);
  await screen.findByText("Backend CV");
  const checkbox = screen.getByRole("checkbox", { name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này" });
  expect(checkbox).not.toBeChecked();
  if (consented) fireEvent.click(checkbox);
  fireEvent.change(screen.getByLabelText("File PDF (tối đa 10 MiB)"), {
    target: { files: [new File(["%PDF-1.7\nbody"], "synthetic.pdf", { type: "application/pdf" })] },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Tải CV mới" }));
  await screen.findByText("CV đã được lưu an toàn. Kết quả phân tích sẽ hiển thị trong danh sách bên dưới.");
  const call = vi.mocked(apiRequest).mock.calls.find(([, options]) => options?.method === "POST")!;
  const body = call[1]!.body as FormData;
  expect(body.get("externalAiConsent")).toBe(String(consented));
  expect(body.get("externalAiPolicyVersion")).toBe(consented ? "external-ai/1.0" : null);
  expect(checkbox).not.toBeChecked();
});

it("explains local fallback as incomplete analysis while keeping review available", async () => {
  vi.mocked(apiRequest).mockImplementation(async (path) => path === "/api/v2/cvs" ? [cv] : {
    ...review, payload: { ...review.payload, summary: { ...review.payload.summary, qualityFlags: ["EXTERNAL_AI_LIMIT_REACHED"] } },
  });
  render(<CandidateCvPanel session={session} />);
  fireEvent.click(await screen.findByRole("button", { name: "Xem bản phân tích" }));
  expect(await screen.findByText("Phân tích tự động chưa đầy đủ, vui lòng kiểm tra và bổ sung.")).toBeInTheDocument();
  expect(screen.queryByText(/EXTERNAL_AI_LIMIT_REACHED/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Xác nhận bản phân tích" })).toBeEnabled();
});

it.each([
  ["SOURCE_STORAGE_UNAVAILABLE", "sau các lần thử lại"],
  ["CV_PDF_PARSE_FAILED", "không bị khóa bằng mật khẩu"],
  ["SOURCE_OBJECT_NOT_FOUND", "Không tìm thấy tệp CV"],
  ["CV_SOURCE_HASH_MISMATCH", "không khớp với bản CV"],
  ["unknown-private-detail", "Chưa phân tích được CV"],
])("shows a safe recovery instruction for failed CV code %s", async (failureCode, instruction) => {
  vi.mocked(apiRequest).mockResolvedValue([{
    ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "FAILED", failureCode },
  }]);
  render(<CandidateCvPanel session={session} />);
  expect(await screen.findByText(new RegExp(instruction))).toBeInTheDocument();
  expect(screen.queryByText("unknown-private-detail")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Xem bản phân tích" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Thử lại" }) !== null).toBe(failureCode === "SOURCE_STORAGE_UNAVAILABLE");
});

it("retries the existing file once and disables the action while the request is pending", async () => {
  const failed = { ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "FAILED", failureCode: "SOURCE_STORAGE_UNAVAILABLE", version: 4 } };
  const queued = { ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "QUEUED", version: 5 } };
  let resolveRetry: (value: typeof queued) => void = () => {};
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.endsWith("/retry")) return new Promise<typeof queued>((resolve) => { resolveRetry = resolve; });
    return [failed];
  });
  render(<CandidateCvPanel session={session} />);
  const button = await screen.findByRole("button", { name: "Thử lại" });
  fireEvent.click(button);
  expect(screen.getByRole("button", { name: "Đang gửi yêu cầu…" })).toBeDisabled();
  fireEvent.click(button);
  expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path.endsWith("/retry"))).toHaveLength(1);
  expect(vi.mocked(apiRequest)).toHaveBeenCalledWith("/api/v2/cvs/cv/retry", expect.objectContaining({
    method: "POST", body: JSON.stringify({ cvVersionId: "version", expectedVersion: 4 }),
  }));
  resolveRetry(queued);
  expect(await screen.findByText("Đang chờ phân tích")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
  // A list request started before the retry can return an older FAILED snapshot.
  fireEvent.click(screen.getByRole("button", { name: "Làm mới" }));
  await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.filter(([path]) => path === "/api/v2/cvs")).toHaveLength(2));
  expect(screen.getByText("Đang chờ phân tích")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
});

it("keeps the retry action available after a network failure", async () => {
  const failed = { ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "FAILED", failureCode: "SOURCE_STORAGE_UNAVAILABLE" } };
  vi.mocked(apiRequest).mockImplementation(async (path) => {
    if (path.endsWith("/retry")) throw new Error("test network failure");
    return [failed];
  });
  render(<CandidateCvPanel session={session} />);
  fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Không thể kết nối");
  await waitFor(() => expect(screen.getByRole("button", { name: "Thử lại" })).toBeEnabled());
});
