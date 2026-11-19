import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ApiClientError, apiRequest } from "../../../shared/api/client";
import type { AuthSession } from "../../../shared/auth/session";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { externalAiPolicyVersion, ExternalAiConsent } from "../../../shared/components/ExternalAiConsent";
import { Button, ErrorBanner, Modal } from "../../../shared/ui";
import { useUnsavedChanges } from "../../../shared/useUnsavedChanges";
import type { CandidateCvRecord } from "../CandidateCvPanel";
import type { CandidateProfile } from "../CandidateProfilePage";
import type { ParsedCvReviewData } from "../ParsedCvReview";
import { CvLivePreview } from "./CvLivePreview";
import { AvatarCropModal } from "./AvatarCropModal";
import { CvTemplateGallery } from "./CvTemplateGallery";
import { CV_WRITING_SUGGESTIONS, type CvWritingSuggestion } from "./cvSuggestions";
import { extractCvFromPdfBytes } from "./pdfExtract";
import {
  ACCENT_PRESETS,
  computeCvCompleteness,
  createCvDocument,
  createCvEntry,
  CV_FONT_FAMILIES,
  CV_FONT_SIZES,
  CV_LINE_SPACINGS,
  cvDocumentErrors,
  exportCvDraft,
  fromServerDraft,
  getSectionLabel,
  importCvDraft,
  MAX_DRAFT_BYTES,
  moveSectionOrder,
  reorderSectionOrder,
  scalarLimits,
  SECTION_LABELS,
  TEMPLATE_META,
  TEMPLATES,
  toggleSectionVisibility,
  toServerDraftRequest,
  type BodySection,
  type CvDocument,
  type CvDraftRecord,
  type CvFontFamily,
  type CvFontSize,
  type CvLineSpacing,
  type TemplateId,
} from "./cvDocument";
import { CvImportLimitError, importParsedCv, prefillCvProfile } from "./cvImport";

type Props = {
  session: AuthSession;
  cvs: CandidateCvRecord[];
  initialDraft?: CvDraftRecord | null;
  initialDoc?: CvDocument | null;
  initialReferencePdfBytes?: Uint8Array | null;
  initialReferencePdfTitle?: string;
  onDraftSaved?: (draft: CvDraftRecord) => void;
  onCvUploaded?: () => void;
  onSwitchToOverlayEditor?: (bytes: Uint8Array, title: string) => void;
  onClose: () => void;
  onLogout?: () => void;
};

type PendingDraft = { doc: CvDocument; fromFile: boolean; message: string; autoRefBytes?: Uint8Array };
type PreviewState = { blob: Blob; url: string; snapshot: string };
type SidebarTab = "design" | "sections" | "suggest" | "check";

const MAX_UNDO_HISTORY = 30;
const ZOOM_OPTIONS = [0.75, 0.9, 1] as const;

const FONT_FAMILY_LABELS: Record<CvFontFamily, string> = {
  sans: "Noto Sans (Hiện đại)",
  serif: "Noto Serif (Cổ điển)",
  mono: "Mono (Kỹ thuật)",
};

const FONT_SIZE_LABELS: Record<CvFontSize, string> = {
  small: "Nhỏ",
  medium: "Vừa",
  large: "Lớn",
};

const LINE_SPACING_LABELS: Record<CvLineSpacing, string> = {
  compact: "Gọn",
  normal: "Chuẩn",
  relaxed: "Thoáng",
};

const importNotice =
  "Đã nhập nội dung CV. Kiểm tra lại toàn bộ; tên công ty, trường học và thông tin liên hệ có thể cần bổ sung. Các mục không muốn công khai có thể xóa.";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Leave time for the browser to start reading a user-triggered download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function filename(doc: CvDocument) {
  return (doc.title.trim() || doc.fullName.trim() || "cv").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 100);
}

function TemplateMiniWireframe({ id, accent }: { id: TemplateId; accent: string }) {
  if (id === "executive") {
    return (
      <div aria-hidden="true" className="mb-1.5 flex h-11 flex-col overflow-hidden rounded border border-border-subtle bg-white">
        <div className="h-3.5 w-full" style={{ backgroundColor: accent }} />
        <div className="grid flex-1 grid-cols-3 gap-1 p-1">
          <div className="space-y-1 rounded-xs bg-slate-100 p-0.5">
            <div className="h-1 w-3/4 rounded-xs bg-slate-300" />
            <div className="h-1 w-2/3 rounded-xs bg-slate-300" />
          </div>
          <div className="col-span-2 space-y-1 p-0.5">
            <div className="h-1 w-full rounded-xs bg-slate-300" />
            <div className="h-1 w-4/5 rounded-xs bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }
  if (id === "modern") {
    return (
      <div aria-hidden="true" className="mb-1.5 grid h-11 w-full grid-cols-3 gap-1 rounded border border-border-subtle bg-white p-1">
        <div className="space-y-1 rounded-xs bg-slate-100 p-1">
          <div className="h-1.5 w-full rounded-xs" style={{ backgroundColor: accent }} />
          <div className="h-1 w-3/4 rounded-xs bg-slate-300" />
          <div className="h-1 w-2/3 rounded-xs bg-slate-300" />
        </div>
        <div className="col-span-2 space-y-1 p-0.5">
          <div className="h-1.5 w-1/2 rounded-xs bg-slate-400" />
          <div className="h-1 w-full rounded-xs bg-slate-200" />
          <div className="h-1 w-5/6 rounded-xs bg-slate-200" />
        </div>
      </div>
    );
  }
  if (id === "minimal") {
    return (
      <div aria-hidden="true" className="mb-1.5 h-11 space-y-1 rounded border border-border-subtle bg-white p-1.5">
        <div className="border-l-3 pl-1.5" style={{ borderLeftColor: accent }}>
          <div className="h-1.5 w-1/2 rounded-xs bg-slate-700" />
          <div className="mt-0.5 h-1 w-1/3 rounded-xs bg-slate-300" />
        </div>
        <div className="h-1 w-full rounded-xs bg-slate-200" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="mb-1.5 h-11 space-y-1 rounded border border-border-subtle bg-white p-1.5">
      <div className="border-b pb-1" style={{ borderBottomColor: accent }}>
        <div className="h-1.5 w-1/2 rounded-xs bg-slate-700" />
      </div>
      <div className="h-1 w-full rounded-xs bg-slate-200" />
      <div className="h-1 w-4/5 rounded-xs bg-slate-200" />
    </div>
  );
}

export default function CvBuilder({
  session,
  cvs,
  initialDraft = null,
  initialDoc = null,
  initialReferencePdfBytes = null,
  initialReferencePdfTitle = "PDF gốc",
  onDraftSaved,
  onCvUploaded,
  onSwitchToOverlayEditor,
  onClose,
  onLogout,
}: Props) {
  const initialDocument = useMemo(
    () => (initialDraft ? fromServerDraft(initialDraft) : initialDoc ?? createCvDocument()),
    [initialDraft, initialDoc],
  );

  const [activeDraft, setActiveDraft] = useState<CvDraftRecord | null>(initialDraft);
  const [doc, setDoc] = useState<CvDocument>(initialDocument);
  const [undoStack, setUndoStack] = useState<CvDocument[]>([]);
  const [redoStack, setRedoStack] = useState<CvDocument[]>([]);
  const [checkpoint, setCheckpoint] = useState(() => JSON.stringify(initialDocument));
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSavedLabel, setAutoSavedLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDraft | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [referencePdfBytes, setReferencePdfBytes] = useState<Uint8Array | null>(initialReferencePdfBytes);
  const [referencePdfUrl, setReferencePdfUrl] = useState<string | null>(null);
  const [referencePdfTitle, setReferencePdfTitle] = useState(initialReferencePdfTitle);
  const [showReferencePdf, setShowReferencePdf] = useState(Boolean(initialReferencePdfBytes));
  const [mobilePane, setMobilePane] = useState<"tools" | "canvas">("canvas");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("design");
  const [previewMode, setPreviewMode] = useState<"canvas" | "pdf">("canvas");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [zoom, setZoom] = useState<number>(0.9);
  const [externalAiConsent, setExternalAiConsent] = useState(false);
  const [dragSectionIndex, setDragSectionIndex] = useState<number | null>(null);
  const [dropSectionIndex, setDropSectionIndex] = useState<number | null>(null);

  const active = useRef(true);
  const operation = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const activeDraftRef = useRef(activeDraft);
  activeDraftRef.current = activeDraft;

  const currentSnapshot = JSON.stringify(doc);
  const dirty = currentSnapshot !== checkpoint;
  const importable = cvs.filter(cv => cv.status === "ACTIVE" && cv.activeVersion.processingStatus === "CONFIRMED");
  const templateMeta = TEMPLATE_META[doc.templateId];
  const completeness = useMemo(() => computeCvCompleteness(doc), [doc]);
  const suggestions = CV_WRITING_SUGGESTIONS[doc.language];

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  useEffect(() => {
    if (!referencePdfBytes) {
      setReferencePdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([Uint8Array.from(referencePdfBytes)], { type: "application/pdf" }));
    setReferencePdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [referencePdfBytes]);

  useUnsavedChanges(dirty, () => setError("Hãy lưu bản nháp trước khi rời trang để giữ nội dung chỉnh sửa."));

  // Debounced auto-save when editing an existing server draft cleanly.
  useEffect(() => {
    if (!activeDraft || !dirty || busy || pending || pendingAvatarFile || galleryOpen || uploadModalOpen) return;
    const timer = window.setTimeout(() => {
      const targetDraft = activeDraftRef.current;
      if (!targetDraft || operation.current) return;
      const snapshotAtSend = JSON.stringify(docRef.current);
      setAutoSaving(true);
      void (async () => {
        try {
          const body = toServerDraftRequest(docRef.current, targetDraft.version);
          const saved = await apiRequest<CvDraftRecord>(`/api/v2/cvs/drafts/${targetDraft.draftId}`, {
            method: "PUT",
            accessToken: session.accessToken,
            body: JSON.stringify(body),
          });
          if (!active.current) return;
          setActiveDraft(saved);
          onDraftSaved?.(saved);
          if (JSON.stringify(docRef.current) === snapshotAtSend) {
            setCheckpoint(snapshotAtSend);
            setAutoSavedLabel("Tự động lưu ✓");
          }
        } catch (err) {
          if (!active.current) return;
          if (err instanceof ApiClientError && err.status === 409) {
            setError("Bản nháp đã được cập nhật ở nơi khác. Hãy đóng và mở lại bản mới nhất.");
          }
        } finally {
          if (active.current) setAutoSaving(false);
        }
      })();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [activeDraft, busy, currentSnapshot, dirty, galleryOpen, onDraftSaved, pending, pendingAvatarFile, session.accessToken, uploadModalOpen]);

  // Global studio keyboard shortcuts (Ctrl+S save, Ctrl+Z/Y history outside raw inputs).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (!busy && !pending && !pendingAvatarFile) {
          void saveToServer();
        }
        return;
      }
      const tag = (event.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function invalidatePreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setPreviewMode("canvas");
  }

  function commitDoc(next: CvDocument, recordHistory = true) {
    if (JSON.stringify(next) === currentSnapshot) return;
    invalidatePreview();
    if (recordHistory) {
      setUndoStack(prev => [...prev.slice(-(MAX_UNDO_HISTORY - 1)), doc]);
      setRedoStack([]);
    }
    setDoc(next);
    setError(null);
  }

  function handleUndo() {
    if (undoStack.length === 0 || busy) return;
    const previous = undoStack[undoStack.length - 1];
    invalidatePreview();
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev.slice(-(MAX_UNDO_HISTORY - 1)), doc]);
    setDoc(previous);
    setError(null);
  }

  function handleRedo() {
    if (redoStack.length === 0 || busy) return;
    const restored = redoStack[redoStack.length - 1];
    invalidatePreview();
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO_HISTORY - 1)), doc]);
    setDoc(restored);
    setError(null);
  }

  function applyDraft(next: PendingDraft) {
    commitDoc(next.doc);
    if (next.fromFile) setCheckpoint(JSON.stringify(next.doc));
    if (next.autoRefBytes) {
      setReferencePdfBytes(next.autoRefBytes);
      setShowReferencePdf(true);
    }
    setNotice(next.message);
    setPending(null);
    setMobilePane("canvas");
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
      if (failure instanceof ApiClientError && failure.status === 401) {
        onLogout?.();
      } else if (failure instanceof CvImportLimitError) {
        setError(failure.message);
      } else if (failure instanceof ApiClientError) {
        if (kind === "save" && failure.status === 409) {
          setError("Bản nháp đã được cập nhật ở nơi khác. Hãy đóng và mở lại bản nháp mới nhất trước khi lưu.");
        } else {
          setError(failure.error.message);
        }
      } else {
        setError(
          kind === "pdf"
            ? "Chưa tạo được PDF. Kiểm tra nội dung, ảnh đại diện và thử lại."
            : kind === "file"
              ? "File nháp không hợp lệ hoặc vượt giới hạn 256 KiB. Nội dung hiện tại vẫn được giữ."
              : kind === "save"
                ? "Chưa lưu được bản nháp lên tài khoản. Vui lòng thử lại hoặc tải file nháp dự phòng."
                : kind === "upload"
                  ? "Chưa lưu được PDF vào thư viện CV. Bạn vẫn có thể tải PDF về máy và thử lại."
                  : "Không lấy được dữ liệu. Nội dung hiện tại vẫn được giữ; vui lòng thử lại.",
        );
      }
    } finally {
      operation.current = false;
      controller.current = null;
      if (active.current) setBusy(null);
    }
  }

  function handleAvatarUpload(file: File) {
    setError(null);
    setPendingAvatarFile(file);
  }

  async function importLocalPdfFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("File PDF vượt quá giới hạn 10 MiB.");
      return;
    }
    await run("import", async signal => {
      const buf = await file.arrayBuffer();
      if (!active.current || signal.aborted) return;
      const bytes = new Uint8Array(buf);
      if (bytes.length < 5 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
        throw new CvImportLimitError("Tệp đã chọn không phải file PDF hợp lệ (%PDF-).");
      }
      const result = await extractCvFromPdfBytes(bytes, doc);
      if (!active.current || signal.aborted) return;
      setReferencePdfTitle(file.name);
      if (result.likelyScanned) {
        setReferencePdfBytes(bytes);
        setShowReferencePdf(true);
        setNotice("File PDF dạng ảnh/scan chưa có lớp chữ để bóc tự động. Đã mở PDF gốc ở khung đối chiếu bên cạnh; bạn cũng có thể dùng 'Sửa trực tiếp trên PDF'.");
        return;
      }
      setPending({
        doc: result.doc,
        fromFile: false,
        autoRefBytes: bytes,
        message: `Đã trích xuất ${result.extractedLines} dòng từ "${file.name}" (${result.pageCount} trang) và mở khung PDF gốc để đối chiếu.`,
      });
    });
  }

  async function prefill() {
    await run("profile", async signal => {
      const profile = await apiRequest<CandidateProfile>("/api/v2/candidates/me", {
        accessToken: session.accessToken,
        signal,
      });
      if (!active.current || signal.aborted) return;
      setPending({
        doc: prefillCvProfile(doc, profile),
        fromFile: false,
        message: "Đã áp dụng thông tin từ hồ sơ cá nhân. Kiểm tra trước khi tạo PDF.",
      });
    });
  }

  async function importSource() {
    const cv = importable.find(item => item.cvId === sourceId);
    if (!cv) return;
    await run("import", async signal => {
      const review = await apiRequest<ParsedCvReviewData>(`/api/v2/cvs/${cv.cvId}/parsed-review`, {
        accessToken: session.accessToken,
        signal,
      });
      if (!active.current || signal.aborted) return;
      if (review.status !== "CONFIRMED") {
        throw new CvImportLimitError("CV này chưa được xác nhận sau phân tích nên không thể nhập tự động.");
      }
      setPending({ doc: importParsedCv(doc, review.payload), fromFile: false, message: importNotice });
    });
  }

  async function saveToServer() {
    await run("save", async signal => {
      const body = toServerDraftRequest(doc, activeDraft?.version);
      const saved = activeDraft
        ? await apiRequest<CvDraftRecord>(`/api/v2/cvs/drafts/${activeDraft.draftId}`, {
            method: "PUT",
            accessToken: session.accessToken,
            body: JSON.stringify(body),
            signal,
          })
        : await apiRequest<CvDraftRecord>("/api/v2/cvs/drafts", {
            method: "POST",
            accessToken: session.accessToken,
            body: JSON.stringify(body),
            signal,
          });
      if (!active.current || signal.aborted) return;
      const normalized = fromServerDraft(saved);
      setActiveDraft(saved);
      setDoc(normalized);
      setCheckpoint(JSON.stringify(normalized));
      onDraftSaved?.(saved);
      setNotice(`Đã lưu bản nháp "${saved.title}" lên tài khoản (phiên bản ${saved.version + 1}).`);
    });
  }

  async function openDraft(file: File | undefined) {
    if (!file) return;
    await run("file", async signal => {
      if (file.size > MAX_DRAFT_BYTES) throw new Error("Draft too large");
      const next = importCvDraft(await file.text());
      if (!active.current || signal.aborted) return;
      setPending({
        doc: next,
        fromFile: true,
        message: "Đã mở file nháp. Bấm “Lưu bản nháp” nếu muốn đồng bộ lên tài khoản.",
      });
    });
  }

  function saveDraftFile() {
    try {
      const json = exportCvDraft(doc);
      download(new Blob([json], { type: "application/json" }), `${filename(doc)}.cv.json`);
      setNotice("Đã tải file nháp .cv.json về máy.");
      setError(null);
    } catch {
      setError("Không xuất được file nháp. Kiểm tra độ dài nội dung và các mốc thời gian.");
    }
  }

  function requestClose() {
    if (busy) return;
    if (dirty) setDiscarding(true);
    else onClose();
  }

  async function buildPdfBlob(signal: AbortSignal): Promise<PreviewState | null> {
    const { renderCvPdf } = await import("./ClassicCvDocument");
    const snapshot = currentSnapshot;
    const blob = await renderCvPdf(JSON.parse(snapshot) as CvDocument);
    if (!active.current || signal.aborted) return null;
    invalidatePreview();
    const url = URL.createObjectURL(blob);
    previewUrl.current = url;
    const created: PreviewState = { blob, url, snapshot };
    setPreview(created);
    return created;
  }

  function validateBeforePdf(): boolean {
    const errors = cvDocumentErrors(doc);
    if (errors.length) {
      setError(errors.join(" "));
      setMobilePane("canvas");
      return false;
    }
    return true;
  }

  async function generatePdfPreview() {
    if (!validateBeforePdf()) return;
    await run("pdf", async signal => {
      const created = await buildPdfBlob(signal);
      if (!created) return;
      setPreviewMode("pdf");
      setMobilePane("canvas");
      setNotice("Bản xem trước PDF đã sẵn sàng. Bạn có thể tải về hoặc lưu trực tiếp vào thư viện CV.");
    });
  }

  async function downloadPdfDirect() {
    if (!validateBeforePdf()) return;
    if (preview && preview.snapshot === currentSnapshot) {
      download(preview.blob, `${filename(doc)}.pdf`);
      setNotice("Đang tải xuống file PDF của bạn.");
      return;
    }
    await run("pdf", async signal => {
      const created = await buildPdfBlob(signal);
      if (!created) return;
      download(created.blob, `${filename(doc)}.pdf`);
      setNotice("Đã tạo và tải xuống file PDF thành công.");
    });
  }

  async function uploadPdfToLibrary() {
    if (!validateBeforePdf()) return;
    await run("upload", async signal => {
      const activePreview =
        preview && preview.snapshot === currentSnapshot ? preview : await buildPdfBlob(signal);
      if (!activePreview || !active.current || signal.aborted) return;
      const pdfFile = new File([activePreview.blob], `${filename(doc)}.pdf`, { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", pdfFile);
      formData.append("title", (doc.title.trim() || doc.fullName.trim() || "CV tạo theo mẫu").slice(0, scalarLimits.title));
      formData.append("externalAiConsent", String(externalAiConsent));
      if (externalAiConsent) {
        formData.append("externalAiPolicyVersion", externalAiPolicyVersion);
      }
      await apiRequest<CandidateCvRecord>("/api/v2/cvs", {
        method: "POST",
        accessToken: session.accessToken,
        body: formData,
        signal,
      });
      if (!active.current || signal.aborted) return;
      setExternalAiConsent(false);
      setUploadModalOpen(false);
      onCvUploaded?.();
      setNotice("Đã lưu CV PDF vào thư viện CV. Hệ thống sẽ phân tích để bạn kiểm tra và xác nhận.");
    });
  }

  function applyWritingSuggestion(suggestion: CvWritingSuggestion) {
    if (suggestion.section === "introduction") {
      commitDoc({
        ...doc,
        introduction: suggestion.content,
        hiddenSections: doc.hiddenSections.filter(s => s !== "introduction"),
      });
      setNotice("Đã điền mẫu mục tiêu nghề nghiệp. Bạn có thể chỉnh sửa lại theo đúng kinh nghiệm của mình.");
      return;
    }
    if (suggestion.section === "skills") {
      commitDoc({
        ...doc,
        skills: suggestion.content,
        hiddenSections: doc.hiddenSections.filter(s => s !== "skills"),
      });
      setNotice("Đã chèn mẫu phân nhóm kỹ năng.");
      return;
    }
    const target = suggestion.section;
    const entry = createCvEntry();
    entry.title = suggestion.section === "experiences" ? "Vị trí công việc mới" : "Tên dự án nổi bật";
    entry.subtitle = suggestion.section === "experiences" ? "Tên công ty" : "Vai trò cá nhân";
    entry.description = suggestion.content;
    commitDoc({
      ...doc,
      [target]: [...doc[target], entry],
      hiddenSections: doc.hiddenSections.filter(s => s !== target),
    });
    setNotice(`Đã thêm gợi ý vào mục ${getSectionLabel(target, doc.language)}.`);
  }

  function handleSectionDragStart(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      setDragSectionIndex(index);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-cv-section", String(index));
    };
  }

  function handleSectionDragOver(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      if (dragSectionIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dropSectionIndex !== index) setDropSectionIndex(index);
    };
  }

  function handleSectionDrop(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      if (dragSectionIndex === null) return;
      event.preventDefault();
      if (dragSectionIndex !== index) {
        commitDoc({
          ...doc,
          sectionOrder: reorderSectionOrder(doc.sectionOrder, dragSectionIndex, index),
        });
      }
      setDragSectionIndex(null);
      setDropSectionIndex(null);
    };
  }

  const previewReady = Boolean(preview && preview.snapshot === currentSnapshot);

  return (
    <>
      <Modal
        open={!pending && !discarding && !galleryOpen && !uploadModalOpen && !pendingAvatarFile}
        onClose={requestClose}
        title="Trình tạo CV theo mẫu"
        eyebrow={templateMeta.badge}
        description="Nhấp trực tiếp vào từng mục trên trang giấy CV để chỉnh sửa, kéo thả đổi bố cục, lưu bản nháp và tải xuống PDF."
        size="full"
        closeDisabled={Boolean(busy)}
        closeLabel="Đóng trình tạo CV"
      >
        <div className="space-y-3 py-3">
          {/* TopCV-style sticky editor action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-slate-50 px-3.5 py-2.5">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
              <input
                type="text"
                aria-label="Tên bản CV"
                maxLength={scalarLimits.title}
                value={doc.title}
                placeholder="Đặt tên CV (VD: Backend Engineer 2026)"
                disabled={Boolean(busy)}
                onChange={event => commitDoc({ ...doc, title: event.target.value })}
                className="h-9 min-w-[210px] flex-1 max-w-xs rounded-lg border border-border-strong bg-white px-3 text-sm font-semibold text-ink-900 focus:border-brand-600 focus:outline-none"
              />
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink-600 border border-border-subtle">
                {autoSaving
                  ? "Đang tự lưu…"
                  : dirty
                    ? "Có thay đổi chưa lưu"
                    : activeDraft
                      ? (autoSavedLabel ?? `Đã lưu trên tài khoản (v${activeDraft.version + 1})`)
                      : "Bản mới chưa lưu"}
              </span>
              <div className="flex items-center gap-1" role="group" aria-label="Lịch sử chỉnh sửa">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy) || undoStack.length === 0}
                  onClick={handleUndo}
                >
                  ↶ Hoàn tác
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={Boolean(busy) || redoStack.length === 0}
                  onClick={handleRedo}
                >
                  ↷ Làm lại
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void saveToServer()}>
                {busy === "save" ? "Đang lưu…" : activeDraft ? "Cập nhật bản nháp" : "Lưu bản nháp"}
              </Button>
              <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void generatePdfPreview()}>
                {busy === "pdf" && previewMode !== "pdf" ? "Đang tạo PDF…" : "Tạo bản xem trước PDF"}
              </Button>
              <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => void downloadPdfDirect()}>
                {busy === "pdf" ? "Đang xuất…" : "Tải xuống PDF"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (!validateBeforePdf()) return;
                  setUploadModalOpen(true);
                }}
              >
                Lưu vào thư viện CV
              </Button>
            </div>
          </div>

          {error && <ErrorBanner message={error} />}
          {notice && (
            <p role="status" className="m-0 rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-900">
              {notice}
            </p>
          )}

          {/* Mobile workspace switcher */}
          <div className="flex gap-2 lg:hidden" role="group" aria-label="Chế độ trình tạo CV">
            <Button variant={mobilePane === "canvas" ? "primary" : "secondary"} size="sm" onClick={() => setMobilePane("canvas")}>
              Trang CV A4
            </Button>
            <Button variant={mobilePane === "tools" ? "primary" : "secondary"} size="sm" onClick={() => setMobilePane("tools")}>
              Thiết kế & Gợi ý
            </Button>
          </div>

          {/* TopCV Split Studio: Left Sidebar Tools + Right/Center WYSIWYG A4 Canvas */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
            <aside
              aria-label="Thanh công cụ thiết kế CV"
              className={`${mobilePane === "tools" ? "block" : "hidden"} min-w-0 space-y-3 rounded-lg border border-border-subtle bg-slate-50 p-3 lg:block`}
            >
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 border border-border-subtle" role="tablist" aria-label="Nhóm công cụ trình tạo CV">
                {(
                  [
                    { id: "design", label: "Thiết kế" },
                    { id: "sections", label: "Bố cục mục" },
                    { id: "suggest", label: "Gợi ý & Nhập" },
                    { id: "check", label: `Hoàn thiện (${completeness.score}%)` },
                  ] as const
                ).map(item => {
                  const selected = sidebarTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setSidebarTab(item.id)}
                      className={`cursor-pointer rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                        selected ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-slate-100"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {sidebarTab === "design" && (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-lg border border-border-subtle bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Mẫu CV</h3>
                      <Button size="sm" variant="ghost" onClick={() => setGalleryOpen(true)}>
                        Thư viện mẫu
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Chọn mẫu CV">
                      {TEMPLATES.map(id => {
                        const meta = TEMPLATE_META[id];
                        const selected = doc.templateId === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => commitDoc({ ...doc, templateId: id })}
                            className={`cursor-pointer rounded-lg border p-2 text-left transition ${
                              selected
                                ? "border-brand-600 bg-brand-50/70 text-ink-900 ring-1 ring-brand-600"
                                : "border-border-subtle bg-white text-ink-700 hover:border-border-strong"
                            }`}
                          >
                            <TemplateMiniWireframe id={id} accent={doc.accentColor} />
                            <div className="text-xs font-bold">{meta.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border-subtle bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Màu chủ đạo</h3>
                      <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-ink-600">
                        <span>Tùy chỉnh</span>
                        <input
                          type="color"
                          aria-label="Màu chủ đạo tùy chỉnh"
                          value={doc.accentColor}
                          onChange={e => commitDoc({ ...doc, accentColor: e.target.value })}
                          className="h-6 w-8 cursor-pointer rounded border border-border-subtle bg-white p-0.5"
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ACCENT_PRESETS.map(preset => {
                        const selected = doc.accentColor === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            aria-label={`Màu ${preset.label}`}
                            aria-pressed={selected}
                            onClick={() => commitDoc({ ...doc, accentColor: preset.id })}
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                              selected ? "border-ink-900 bg-slate-100 font-semibold" : "border-border-subtle bg-white text-ink-600"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="h-3 w-3 rounded-full border border-black/15"
                              style={{ backgroundColor: preset.id }}
                            />
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border-subtle bg-white p-3">
                    <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Kiểu chữ & Ngôn ngữ CV</h3>
                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-semibold text-ink-700">Phông chữ CV:</span>
                        <div className="mt-1 grid grid-cols-2 gap-1.5" role="group" aria-label="Phông chữ CV">
                          {CV_FONT_FAMILIES.filter(f => f !== "mono").map(font => (
                            <button
                              key={font}
                              type="button"
                              aria-pressed={doc.fontFamily === font}
                              onClick={() => commitDoc({ ...doc, fontFamily: font })}
                              className={`cursor-pointer rounded-md border px-2 py-1 font-medium ${
                                doc.fontFamily === font
                                  ? "border-brand-600 bg-brand-50 text-brand-800"
                                  : "border-border-subtle bg-white text-ink-700"
                              }`}
                            >
                              {FONT_FAMILY_LABELS[font]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold text-ink-700">Ngôn ngữ tiêu đề:</span>
                        <div className="mt-1 grid grid-cols-2 gap-1.5" role="group" aria-label="Ngôn ngữ CV">
                          {(
                            [
                              { id: "vi", label: "Tiếng Việt" },
                              { id: "en", label: "English" },
                            ] as const
                          ).map(lang => (
                            <button
                              key={lang.id}
                              type="button"
                              aria-pressed={doc.language === lang.id}
                              onClick={() => commitDoc({ ...doc, language: lang.id })}
                              className={`cursor-pointer rounded-md border px-2 py-1 font-medium ${
                                doc.language === lang.id
                                  ? "border-brand-600 bg-brand-50 text-brand-800"
                                  : "border-border-subtle bg-white text-ink-700"
                              }`}
                            >
                              {lang.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-semibold text-ink-700">Cỡ chữ:</span>
                        <div className="mt-1 grid grid-cols-3 gap-1.5" role="group" aria-label="Cỡ chữ CV">
                          {CV_FONT_SIZES.map(size => (
                            <button
                              key={size}
                              type="button"
                              aria-pressed={doc.fontSize === size}
                              onClick={() => commitDoc({ ...doc, fontSize: size })}
                              className={`cursor-pointer rounded-md border px-2 py-1 font-medium ${
                                doc.fontSize === size
                                  ? "border-brand-600 bg-brand-50 text-brand-800"
                                  : "border-border-subtle bg-white text-ink-700"
                              }`}
                            >
                              {FONT_SIZE_LABELS[size]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="font-semibold text-ink-700">Giãn dòng:</span>
                        <div className="mt-1 grid grid-cols-3 gap-1.5" role="group" aria-label="Giãn dòng CV">
                          {CV_LINE_SPACINGS.map(spacing => (
                            <button
                              key={spacing}
                              type="button"
                              aria-pressed={doc.lineSpacing === spacing}
                              onClick={() => commitDoc({ ...doc, lineSpacing: spacing })}
                              className={`cursor-pointer rounded-md border px-2 py-1 font-medium ${
                                doc.lineSpacing === spacing
                                  ? "border-brand-600 bg-brand-50 text-brand-800"
                                  : "border-border-subtle bg-white text-ink-700"
                              }`}
                            >
                              {LINE_SPACING_LABELS[spacing]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border-subtle bg-white p-3">
                    <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Ảnh đại diện & File nháp</h3>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex cursor-pointer items-center rounded-lg border border-border-strong bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-800 hover:bg-slate-50">
                        {doc.photoDataUrl ? "Đổi ảnh thẻ" : "Tải ảnh thẻ"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="sr-only"
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void handleAvatarUpload(file);
                          }}
                        />
                      </label>
                      {doc.photoDataUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => commitDoc({ ...doc, photoDataUrl: "" })}
                        >
                          Xóa ảnh
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-2">
                      <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={saveDraftFile}>
                        Tải file nháp
                      </Button>
                      <label
                        className={`inline-flex items-center rounded-lg border border-border-strong px-2.5 py-1.5 text-xs font-semibold ${
                          busy ? "opacity-50" : "cursor-pointer hover:bg-slate-50"
                        }`}
                      >
                        Mở file nháp
                        <input
                          className="sr-only"
                          aria-label="Mở file nháp"
                          type="file"
                          accept=".json,application/json"
                          disabled={Boolean(busy)}
                          onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void openDraft(file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {sidebarTab === "sections" && (
                <div className="space-y-2.5 rounded-lg border border-border-subtle bg-white p-3">
                  <div>
                    <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Quản lý & Sắp xếp mục</h3>
                    <p className="m-0 mt-0.5 text-[11px] text-ink-500">
                      Kéo thả hoặc bật/tắt các mục hiển thị trên CV.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {doc.sectionOrder.map((section, index) => {
                      const isHidden = doc.hiddenSections.includes(section);
                      const isDragged = dragSectionIndex === index;
                      const isDropTarget = dropSectionIndex === index && dragSectionIndex !== index;
                      return (
                        <div
                          key={section}
                          draggable={!busy && !pending}
                          onDragStart={handleSectionDragStart(index)}
                          onDragOver={handleSectionDragOver(index)}
                          onDrop={handleSectionDrop(index)}
                          onDragEnd={() => {
                            setDragSectionIndex(null);
                            setDropSectionIndex(null);
                          }}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                            isDragged
                              ? "opacity-50 border-brand-400"
                              : isDropTarget
                                ? "border-brand-500 ring-2 ring-brand-500/40"
                                : isHidden
                                  ? "border-border-subtle bg-slate-50 text-ink-400"
                                  : "border-border-subtle bg-white text-ink-800"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span aria-hidden="true" className="cursor-grab font-bold text-ink-400 select-none">
                              ⋮⋮
                            </span>
                            <label className="flex min-w-0 cursor-pointer items-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={!isHidden}
                                onChange={() =>
                                  commitDoc({
                                    ...doc,
                                    hiddenSections: toggleSectionVisibility(doc.hiddenSections, section),
                                  })
                                }
                              />
                              <span className="truncate font-semibold">{SECTION_LABELS[section]}</span>
                            </label>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={index === 0}
                              aria-label={`Đưa mục ${SECTION_LABELS[section]} lên`}
                              onClick={() =>
                                commitDoc({ ...doc, sectionOrder: moveSectionOrder(doc.sectionOrder, index, -1) })
                              }
                            >
                              ↑
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={index === doc.sectionOrder.length - 1}
                              aria-label={`Đưa mục ${SECTION_LABELS[section]} xuống`}
                              onClick={() =>
                                commitDoc({ ...doc, sectionOrder: moveSectionOrder(doc.sectionOrder, index, 1) })
                              }
                            >
                              ↓
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {sidebarTab === "suggest" && (
                <div className="space-y-3">
                  <div className="space-y-2.5 rounded-lg border border-border-subtle bg-white p-3">
                    <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Điền từ dữ liệu & File PDF</h3>
                    <div className="flex flex-wrap gap-2">
                      <label
                        className={`inline-flex items-center rounded-lg border border-brand-600 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 ${
                          busy ? "opacity-50" : "cursor-pointer hover:bg-brand-100"
                        }`}
                      >
                        Nhập từ file PDF…
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          aria-label="Nhập trực tiếp từ file PDF"
                          className="sr-only"
                          disabled={Boolean(busy)}
                          onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void importLocalPdfFile(file);
                          }}
                        />
                      </label>
                      <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void prefill()}>
                        {busy === "profile" ? "Đang lấy hồ sơ…" : "Lấy thông tin từ hồ sơ"}
                      </Button>
                    </div>
                    <label className="block text-xs font-medium text-ink-700">
                      CV nguồn
                      <select
                        aria-label="CV nguồn"
                        className="mt-1 h-9 w-full rounded-lg border border-border-strong bg-white px-2.5 text-xs text-ink-900"
                        value={sourceId}
                        onChange={event => setSourceId(event.target.value)}
                      >
                        <option value="">Chọn CV đã xác nhận</option>
                        {importable.map(cv => (
                          <option key={cv.cvId} value={cv.cvId}>
                            {cv.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button size="sm" variant="secondary" disabled={!sourceId || Boolean(busy)} onClick={() => void importSource()}>
                      {busy === "import" ? "Đang nhập dữ liệu…" : "Nhập nội dung CV cũ"}
                    </Button>
                    <p className="m-0 text-[11px] leading-relaxed text-ink-500">
                      {importable.length
                        ? "Lấy nội dung sang mẫu mới; không giữ bố cục cũ. Bạn sẽ kiểm tra trước khi thay thế."
                        : "Chưa có CV đã xác nhận trong thư viện để nhập nội dung."}
                    </p>
                  </div>

                  <div className="space-y-2 rounded-lg border border-border-subtle bg-white p-3">
                    <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Gợi ý viết CV chuẩn</h3>
                    <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                      {suggestions.map(item => (
                        <div key={item.id} className="space-y-1.5 rounded-lg border border-border-subtle bg-slate-50/70 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="inline-block rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                                {item.roleTag}
                              </span>
                              <div className="mt-0.5 text-xs font-bold text-ink-900">{item.title}</div>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => applyWritingSuggestion(item)}>
                              + Chèn
                            </Button>
                          </div>
                          <p className="m-0 whitespace-pre-line text-[11px] leading-relaxed text-ink-700">{item.content}</p>
                          <p className="m-0 text-[10px] text-ink-500">Mẹo: {item.tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {sidebarTab === "check" && (
                <div className="space-y-3 rounded-lg border border-border-subtle bg-white p-3">
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-ink-900">
                      <span>Mức độ hoàn thiện CV</span>
                      <span className="text-brand-700">{completeness.score}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-brand-600 transition-all"
                        style={{ width: `${completeness.score}%` }}
                      />
                    </div>
                  </div>
                  <ul className="m-0 list-none space-y-2 p-0 text-xs">
                    {completeness.items.map(item => (
                      <li key={item.id} className="flex items-start justify-between gap-2">
                        <span className={item.completed ? "text-emerald-800" : "text-ink-700"}>
                          {item.completed ? "✓" : "○"} {item.label}
                        </span>
                        <span className="shrink-0 text-[11px] font-medium text-ink-400">+{item.points}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </aside>

            {/* Center A4 Canvas on neutral gray TopCV background */}
            <section
              aria-label="Trang soạn thảo CV A4"
              className={`${mobilePane === "canvas" ? "block" : "hidden"} min-w-0 rounded-lg border border-border-subtle bg-[#eef2f6] p-3 sm:p-5 lg:block`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chế độ trang CV">
                  <Button
                    size="sm"
                    variant={previewMode === "canvas" ? "primary" : "secondary"}
                    onClick={() => setPreviewMode("canvas")}
                  >
                    Chỉnh sửa trực tiếp
                  </Button>
                  <Button
                    size="sm"
                    variant={previewMode === "pdf" ? "primary" : "secondary"}
                    disabled={!previewReady}
                    onClick={() => setPreviewMode("pdf")}
                  >
                    Xem bản PDF
                  </Button>
                  {referencePdfUrl && (
                    <Button
                      size="sm"
                      variant={showReferencePdf ? "primary" : "secondary"}
                      onClick={() => setShowReferencePdf(v => !v)}
                    >
                      {showReferencePdf ? "Ẩn PDF gốc" : "Đối chiếu PDF gốc"}
                    </Button>
                  )}
                  {referencePdfBytes && onSwitchToOverlayEditor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(busy)}
                      onClick={() => onSwitchToOverlayEditor(referencePdfBytes, referencePdfTitle)}
                    >
                      Sửa trực tiếp trên PDF
                    </Button>
                  )}
                </div>

                {previewMode === "canvas" ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-ink-600 font-medium">Thu phóng:</span>
                    {ZOOM_OPTIONS.map(option => (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={zoom === option}
                        onClick={() => setZoom(option)}
                        className={`cursor-pointer rounded-md border px-2 py-1 text-[11px] font-semibold ${
                          zoom === option
                            ? "border-brand-600 bg-white text-brand-700"
                            : "border-border-subtle bg-white/70 text-ink-600 hover:bg-white"
                        }`}
                      >
                        {Math.round(option * 100)}%
                      </button>
                    ))}
                  </div>
                ) : (
                  previewReady &&
                  preview && (
                    <div className="flex flex-wrap gap-3 text-xs">
                      <a className="font-semibold text-brand-700 underline" href={preview.url} download={`${filename(doc)}.pdf`}>
                        Tải PDF
                      </a>
                      <a className="text-brand-700 underline" href={preview.url} target="_blank" rel="noopener noreferrer">
                        Mở PDF trong tab mới
                      </a>
                    </div>
                  )
                )}
              </div>

              {previewMode === "pdf" && previewReady && preview ? (
                <iframe
                  title={`Xem trước PDF ${templateMeta.name}`}
                  src={preview.url}
                  className="h-[70vh] w-full rounded-lg border border-border-subtle bg-white shadow-sm"
                />
              ) : (
                <div className={showReferencePdf && referencePdfUrl ? "grid gap-4 xl:grid-cols-2" : ""}>
                  {showReferencePdf && referencePdfUrl && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold text-ink-700">PDF gốc đối chiếu: {referencePdfTitle}</div>
                      <iframe
                        title={`PDF gốc ${referencePdfTitle}`}
                        src={referencePdfUrl}
                        className="h-[70vh] w-full rounded-lg border border-border-subtle bg-white shadow-sm"
                      />
                    </div>
                  )}
                  <div className="max-h-[72vh] overflow-auto pb-4">
                    <div
                      className="mx-auto transition-transform origin-top"
                      style={{
                        maxWidth: "794px",
                        transform: zoom === 1 ? undefined : `scale(${zoom})`,
                      }}
                    >
                      <CvLivePreview
                        doc={doc}
                        editable
                        disabled={Boolean(busy) || Boolean(pending)}
                        onChangeDoc={next => commitDoc(next)}
                        onReorderSection={(fromIndex, toIndex) =>
                          commitDoc({ ...doc, sectionOrder: reorderSectionOrder(doc.sectionOrder, fromIndex, toIndex) })
                        }
                        onMoveSection={(index, direction) =>
                          commitDoc({ ...doc, sectionOrder: moveSectionOrder(doc.sectionOrder, index, direction) })
                        }
                        onUploadAvatar={file => handleAvatarUpload(file)}
                        onRemoveAvatar={() => commitDoc({ ...doc, photoDataUrl: "" })}
                        onRequestSuggestion={() => {
                          setSidebarTab("suggest");
                          setMobilePane("tools");
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </Modal>

      <Modal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        title="Chọn mẫu CV mới"
        description="Chọn mẫu và màu nhấn để áp dụng trực tiếp vào nội dung CV đang soạn."
        size="xl"
      >
        <div className="py-3">
          <CvTemplateGallery
            compact
            onSelectTemplate={(templateId, accentColor) => {
              commitDoc({ ...doc, templateId, accentColor });
              setGalleryOpen(false);
              setNotice(`Đã chuyển sang mẫu ${TEMPLATE_META[templateId].name}. Nội dung hiện tại vẫn được giữ nguyên.`);
            }}
          />
        </div>
      </Modal>

      <Modal
        open={uploadModalOpen}
        onClose={() => {
          if (!busy) setUploadModalOpen(false);
        }}
        title="Lưu CV vào thư viện"
        description="Tạo bản PDF hiện tại và lưu vào thư viện CV để dùng khi ứng tuyển."
        size="md"
        closeDisabled={Boolean(busy)}
      >
        <div className="space-y-4 py-3">
          <ExternalAiConsent
            checked={externalAiConsent}
            disabled={Boolean(busy)}
            onChange={setExternalAiConsent}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => setUploadModalOpen(false)}>
              Hủy
            </Button>
            <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => void uploadPdfToLibrary()}>
              {busy === "upload" ? "Đang lưu vào thư viện…" : "Xác nhận lưu vào thư viện CV"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pending)}
        busy={false}
        title="Áp dụng dữ liệu vào bản CV?"
        description={
          pending?.fromFile
            ? "File nháp sẽ thay thế toàn bộ nội dung hiện tại. Lưu hoặc tải file nháp hiện tại trước nếu muốn giữ lại."
            : "Thao tác sẽ thay thế các mục được nhập. Thông tin thiếu hoặc bị ẩn cần được bạn kiểm tra và bổ sung; CV gốc không thay đổi."
        }
        confirmLabel="Áp dụng dữ liệu"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) applyDraft(pending);
        }}
      />

      <AvatarCropModal
        file={pendingAvatarFile}
        onCancel={() => setPendingAvatarFile(null)}
        onConfirm={dataUrl => {
          setPendingAvatarFile(null);
          commitDoc({ ...doc, photoDataUrl: dataUrl });
          setNotice("Đã cắt và cập nhật ảnh đại diện trên CV.");
        }}
      />

      <ConfirmDialog
        open={discarding}
        busy={false}
        title="Đóng bản CV đang chỉnh sửa?"
        description="Các thay đổi chưa lưu sẽ mất khi đóng. Hãy bấm Lưu bản nháp hoặc tải file nháp nếu muốn chỉnh sửa tiếp lần sau."
        confirmLabel="Bỏ thay đổi và đóng"
        onCancel={() => setDiscarding(false)}
        onConfirm={onClose}
      />
    </>
  );
}
