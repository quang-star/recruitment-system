import { useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../../../shared/api/client";
import type { AuthSession } from "../../../shared/auth/session";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Button, ErrorBanner, Modal } from "../../../shared/ui";
import { useUnsavedChanges } from "../../../shared/useUnsavedChanges";
import type { CandidateCvRecord } from "../CandidateCvPanel";
import type { CandidateProfile } from "../CandidateProfilePage";
import type { ParsedCvReviewData } from "../ParsedCvReview";
import { builderInputClass, CvEntryEditor } from "./CvEntryEditor";
import {
  createCvDocument, cvDocumentErrors, exportCvDraft, importCvDraft, MAX_DRAFT_BYTES,
  scalarLimits, type CvDocument
} from "./cvDocument";
import { importParsedCv, prefillCvProfile } from "./cvImport";

type Props = { session: AuthSession; cvs: CandidateCvRecord[]; onClose: () => void; onLogout?: () => void };
type PendingDraft = { doc: CvDocument; fromFile: boolean; message: string };
const importNotice = "Đã nhập nội dung CV. Kiểm tra lại toàn bộ; tên công ty, trường học và thông tin liên hệ có thể cần bổ sung. Các mục không muốn công khai có thể xóa.";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Leave time for the browser to start reading a user-triggered download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filename(doc: CvDocument) {
  return (doc.title.trim() || doc.fullName.trim() || "cv").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 100);
}

export default function CvBuilder({ session, cvs, onClose, onLogout }: Props) {
  const [doc, setDoc] = useState(createCvDocument);
  const [checkpoint, setCheckpoint] = useState(() => JSON.stringify(createCvDocument()));
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDraft | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [tab, setTab] = useState<"form" | "preview">("form");
  const [preview, setPreview] = useState<{ url: string; snapshot: string } | null>(null);
  const active = useRef(true);
  const operation = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const dirty = JSON.stringify(doc) !== checkpoint;
  const importable = cvs.filter(cv => cv.status === "ACTIVE" && cv.activeVersion.processingStatus === "CONFIRMED");

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useUnsavedChanges(dirty, () => setError("Hãy tải file nháp để giữ nội dung chỉnh sửa trước khi rời trang."));

  function invalidatePreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
  }

  function change(next: CvDocument) {
    invalidatePreview();
    setDoc(next);
    setError(null);
  }

  function applyDraft(next: PendingDraft) {
    change(next.doc);
    if (next.fromFile) setCheckpoint(JSON.stringify(next.doc));
    setNotice(next.message);
    setPending(null);
    setTab("form");
  }

  async function run(kind: string, task: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(kind);
    setError(null);
    try {
      await task(abort.signal);
    } catch (failure) {
      if (!active.current || abort.signal.aborted) return;
      if (failure instanceof ApiClientError && failure.status === 401) onLogout?.();
      else setError(kind === "pdf"
        ? "Chưa tạo được PDF. Kiểm tra nội dung và kết nối tải font, rồi thử lại."
        : kind === "file" ? "File nháp không hợp lệ hoặc vượt giới hạn 256 KiB. Nội dung hiện tại vẫn được giữ."
        : "Không lấy được dữ liệu. Nội dung hiện tại vẫn được giữ; vui lòng thử lại.");
    } finally {
      operation.current = false;
      if (active.current) setBusy(null);
    }
  }

  function requestClose() {
    if (busy) return;
    if (dirty) setDiscarding(true);
    else onClose();
  }

  async function importSource() {
    const cv = importable.find(item => item.cvId === sourceId);
    if (!cv) return;
    await run("import", async signal => {
      const parsed = await apiRequest<ParsedCvReviewData>(`/api/v2/parsed-cvs/${cv.activeVersion.cvVersionId}`, { accessToken: session.accessToken, signal });
      if (!active.current || signal.aborted) return;
      if (parsed.status !== "CONFIRMED" || parsed.cvVersionId !== cv.activeVersion.cvVersionId) throw new Error("Source changed");
      const next = importParsedCv(doc, parsed.payload);
      next.title = cv.title.slice(0, scalarLimits.title);
      setPending({ doc: next, fromFile: false, message: importNotice });
    });
  }

  async function prefill() {
    await run("profile", async signal => {
      const profile = await apiRequest<CandidateProfile>("/api/v2/candidates/me", { accessToken: session.accessToken, signal });
      if (!active.current || signal.aborted) return;
      setPending({ doc: prefillCvProfile(doc, profile), fromFile: false, message: "Đã điền thông tin từ hồ sơ. Hãy kiểm tra lại trước khi xuất PDF." });
    });
  }

  async function openDraft(file: File | undefined) {
    if (!file) return;
    await run("file", async signal => {
      if (file.size > MAX_DRAFT_BYTES) throw new Error("Draft too large");
      const next = importCvDraft(await file.text());
      if (!active.current || signal.aborted) return;
      setPending({ doc: next, fromFile: true, message: "Đã mở file nháp. Nội dung chỉ được giữ trong phiên này cho đến khi bạn tải file nháp mới." });
    });
  }

  function saveDraft() {
    try {
      const json = exportCvDraft(doc);
      download(new Blob([json], { type: "application/json" }), `${filename(doc)}.cv.json`);
      setCheckpoint(json);
      setNotice("Đã tạo file nháp để tải xuống. Hãy giữ file này để mở và chỉnh sửa lần sau; bản nháp chưa được lưu trên server.");
      setError(null);
    } catch {
      setError("Chưa tạo được file nháp. Kiểm tra độ dài nội dung và mốc thời gian trước khi thử lại.");
    }
  }

  async function generatePdf() {
    const errors = cvDocumentErrors(doc);
    if (errors.length) { setError(errors.join(" ")); setTab("form"); return; }
    const snapshot = JSON.stringify(doc);
    await run("pdf", async signal => {
      const { renderCvPdf } = await import("./ClassicCvDocument");
      const blob = await renderCvPdf(JSON.parse(snapshot) as CvDocument);
      if (!active.current || signal.aborted) return;
      invalidatePreview();
      const url = URL.createObjectURL(blob);
      previewUrl.current = url;
      setPreview({ url, snapshot });
      setTab("preview");
      setNotice("PDF đã sẵn sàng. Tải PDF rồi dùng chức năng tải CV trong thư viện nếu muốn ứng tuyển.");
    });
  }

  const field = (key: keyof typeof scalarLimits, label: string, multiline = false) => <label className="block text-sm font-medium text-ink-800">
    {label}
    {multiline
      ? <textarea aria-label={label} className={builderInputClass} rows={key === "links" ? 2 : 4} maxLength={scalarLimits[key]} value={doc[key]} onChange={event => change({ ...doc, [key]: event.target.value })} />
      : <input aria-label={label} className={builderInputClass} type={key === "email" ? "email" : "text"} maxLength={scalarLimits[key]} value={doc[key]} onChange={event => change({ ...doc, [key]: event.target.value })} />}
  </label>;

  return <>
    <Modal open={!pending && !discarding} onClose={requestClose} title="Tạo CV theo mẫu" eyebrow="CLASSIC · A4 · MỘT CỘT" description="Nhập nội dung, kiểm tra và tải PDF. Lưu file nháp để tiếp tục chỉnh sửa lần sau." size="full" closeDisabled={Boolean(busy)} closeLabel="Đóng trình tạo CV">
      <div className="space-y-4 py-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={saveDraft}>Tải file nháp</Button>
          <label className={`inline-flex items-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold ${busy ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}>
            Mở file nháp
            <input className="sr-only" aria-label="Mở file nháp" type="file" accept=".json,application/json" disabled={Boolean(busy)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void openDraft(file); }} />
          </label>
          <Button size="sm" disabled={Boolean(busy)} onClick={() => void generatePdf()}>{busy === "pdf" ? "Đang tạo PDF…" : "Tạo bản xem trước PDF"}</Button>
          <span className="self-center text-xs text-ink-500">{dirty ? "Có thay đổi chưa tải thành file nháp" : "Bản nháp chưa lưu trên server"}</span>
        </div>
        {error && <ErrorBanner message={error} />}
        {notice && <p role="status" className="m-0 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-900">{notice}</p>}
        <div className="flex gap-2 lg:hidden" role="group" aria-label="Chế độ trình tạo CV">
          <Button variant={tab === "form" ? "primary" : "secondary"} size="sm" onClick={() => setTab("form")}>Nhập nội dung</Button>
          <Button variant={tab === "preview" ? "primary" : "secondary"} size="sm" onClick={() => setTab("preview")}>Xem PDF</Button>
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <div className={`${tab === "form" ? "block" : "hidden"} min-w-0 lg:block`}>
            <fieldset disabled={Boolean(busy) || Boolean(pending)} className="m-0 min-w-0 space-y-5 border-0 p-0">
              <div className="space-y-3 rounded-xl border border-border-subtle bg-slate-50 p-4">
                <h3 className="m-0 text-sm font-bold">Điền từ dữ liệu có sẵn</h3>
                <Button size="sm" variant="secondary" onClick={() => void prefill()}>{busy === "profile" ? "Đang lấy hồ sơ…" : "Lấy thông tin từ hồ sơ"}</Button>
                <label className="block text-xs font-medium">CV nguồn
                  <select aria-label="CV nguồn" className={builderInputClass} value={sourceId} onChange={event => setSourceId(event.target.value)}>
                    <option value="">Chọn CV đã xác nhận</option>
                    {importable.map(cv => <option key={cv.cvId} value={cv.cvId}>{cv.title}</option>)}
                  </select>
                </label>
                <Button size="sm" variant="secondary" disabled={!sourceId} onClick={() => void importSource()}>{busy === "import" ? "Đang nhập dữ liệu…" : "Nhập nội dung CV cũ"}</Button>
                <p className="m-0 text-xs leading-relaxed text-ink-500">{importable.length ? "Lấy nội dung sang mẫu mới; không giữ bố cục cũ. Bạn sẽ kiểm tra trước khi thay thế các mục hiện tại." : "Muốn nhập từ PDF: đóng trình tạo, tải CV lên thư viện rồi kiểm tra và xác nhận bản phân tích."}</p>
              </div>
              {field("title", "Tên bản CV")}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("fullName", "Họ và tên")}{field("headline", "Vị trí / tiêu đề nghề nghiệp")}{field("email", "Email liên hệ")}{field("phone", "Số điện thoại")}</div>
              {field("location", "Địa điểm")}{field("links", "Liên kết cá nhân (mỗi dòng một liên kết)", true)}
              {field("introduction", "Giới thiệu", true)}{field("skills", "Kỹ năng", true)}
              <CvEntryEditor label="Kinh nghiệm" entries={doc.experiences} onChange={experiences => change({ ...doc, experiences })} />
              <CvEntryEditor label="Học vấn" entries={doc.education} onChange={education => change({ ...doc, education })} />
              <CvEntryEditor label="Dự án" entries={doc.projects} onChange={projects => change({ ...doc, projects })} />
              <CvEntryEditor label="Chứng chỉ" entries={doc.certificates} onChange={certificates => change({ ...doc, certificates })} />
              <CvEntryEditor label="Ngoại ngữ" dates={false} entries={doc.languages} onChange={languages => change({ ...doc, languages })} />
            </fieldset>
          </div>
          <section aria-label="Bản PDF của CV" className={`${tab === "preview" ? "block" : "hidden"} min-w-0 rounded-xl border border-border-subtle bg-slate-50 p-3 lg:block`}>
            <div className="lg:sticky lg:top-0">
              {preview && preview.snapshot === JSON.stringify(doc) ? <>
                <div className="mb-3 flex flex-wrap gap-3 text-sm">
                  <a className="font-semibold text-brand-700 underline" href={preview.url} download={`${filename(doc)}.pdf`}>Tải PDF</a>
                  <a className="text-brand-700 underline" href={preview.url} target="_blank" rel="noopener noreferrer">Mở PDF trong tab mới</a>
                </div>
                <iframe title="Xem trước CV Classic" src={preview.url} className="h-[65vh] w-full rounded-lg border-0 bg-white" />
              </> : <div className="flex min-h-60 flex-col items-center justify-center gap-3 p-6 text-center">
                <span className="text-xs font-bold tracking-widest text-brand-700">CLASSIC / A4</span>
                <h3 className="m-0 text-lg font-bold text-ink-900">Một bố cục rõ ràng cho câu chuyện nghề nghiệp</h3>
                <p className="m-0 text-sm leading-relaxed text-ink-500">Điền nội dung rồi chọn “Tạo bản xem trước PDF”. Khi sửa nội dung, hãy tạo lại bản xem trước trước khi tải.</p>
              </div>}
            </div>
          </section>
        </div>
      </div>
    </Modal>
    <ConfirmDialog open={Boolean(pending)} busy={false} title="Áp dụng dữ liệu vào bản CV?" description={pending?.fromFile ? "File nháp sẽ thay thế toàn bộ nội dung hiện tại. Tải file nháp hiện tại trước nếu muốn giữ lại." : "Thao tác sẽ thay thế các trường được nhập. Thông tin thiếu hoặc bị ẩn cần được bạn kiểm tra và bổ sung; CV gốc không thay đổi."} confirmLabel="Áp dụng dữ liệu" onCancel={() => setPending(null)} onConfirm={() => { if (pending) applyDraft(pending); }} />
    <ConfirmDialog open={discarding} busy={false} title="Đóng bản CV đang chỉnh sửa?" description="Nội dung chưa tải thành file nháp sẽ mất khi đóng. Quay lại và tải file nháp nếu muốn chỉnh sửa tiếp lần sau." confirmLabel="Bỏ thay đổi và đóng" onCancel={() => setDiscarding(false)} onConfirm={onClose} />
  </>;
}
