import { FormEvent, lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, apiDownload, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { CvPreviewModal } from "../../shared/components/CvPreviewModal";
import { DocumentReview } from "../../shared/components/DocumentReview";
import {
  externalAiPolicyVersion,
  ExternalAiConsent
} from "../../shared/components/ExternalAiConsent";
import { CvIcon, EyeIcon, TrashIcon, UploadIcon } from "../../shared/components/Icon";
import { PdfSource } from "../../shared/components/PdfSource";
import { Badge, Button, Card, EmptyState, ErrorBanner } from "../../shared/ui";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import {
  createCvDocument,
  fromServerDraft,
  toServerDraftRequest,
  type CvDocument,
  type CvDraftRecord,
  type TemplateId,
} from "./cv-builder/cvDocument";
import { importParsedCv } from "./cv-builder/cvImport";
import { CvTemplateGallery } from "./cv-builder/CvTemplateGallery";
import { CvTemplatePreviewModal } from "./cv-builder/CvTemplatePreviewModal";
import {
  canRetryCv,
  cvFailureInstruction,
  cvStatusLabels,
  pendingCvStatuses,
  reviewCvStatuses
} from "./cvStatus";
import { ParsedCvPayload, ParsedCvReview, ParsedCvReviewData } from "./ParsedCvReview";

export type CandidateCvRecord = {
  cvId: string;
  title: string;
  status: string;
  version: number;
  createdAt?: string;
  activeVersion: {
    cvVersionId: string;
    originalFilename: string;
    sizeBytes: number;
    processingStatus: string;
    version: number;
    failureCode: string | null;
  };
};

type Props = { session: AuthSession; onLogout?: () => void };

const MAX_CV_BYTES = 10 * 1024 * 1024;
const CvBuilder = lazy(() => import("./cv-builder/CvBuilder"));
const PdfOverlayEditor = lazy(() =>
  import("./cv-builder/PdfOverlayEditor").then((module) => ({ default: module.PdfOverlayEditor }))
);

function statusBadgeTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "CONFIRMED") return "success";
  if (reviewCvStatuses.includes(status)) return "warning";
  if (pendingCvStatuses.includes(status)) return "info";
  if (status === "FAILED" || status === "REJECTED") return "danger";
  return "neutral";
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}

function isCvDraftRecord(value: unknown): value is CvDraftRecord {
  return Boolean(
    value &&
    typeof value === "object" &&
    "draftId" in value &&
    typeof (value as CvDraftRecord).draftId === "string" &&
    "templateId" in value &&
    "payload" in value
  );
}

const templateLabels: Record<string, string> = {
  classic: "Classic",
  modern: "Modern",
  minimal: "Minimal",
  executive: "Executive"
};

export function CandidateCvPanel({ session, onLogout }: Props) {
  const [workspaceTab, setWorkspaceTab] = useState<"library" | "templates">("library");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<CvDraftRecord | null>(null);
  const [initialBuilderDoc, setInitialBuilderDoc] = useState<CvDocument | null>(null);
  const [referencePdf, setReferencePdf] = useState<{ bytes: Uint8Array; title: string } | null>(null);
  const [overlayEditor, setOverlayEditor] = useState<{ initialBytes: Uint8Array | null; initialTitle: string } | null>(null);
  const [openingActionKey, setOpeningActionKey] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<{ templateId: TemplateId; accentColor: string } | null>(null);
  const [serverDrafts, setServerDrafts] = useState<CvDraftRecord[]>([]);
  const [deletingDraft, setDeletingDraft] = useState<CvDraftRecord | null>(null);
  const [deletingDraftBusy, setDeletingDraftBusy] = useState(false);
  const [cvs, setCvs] = useState<CandidateCvRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [externalAiConsent, setExternalAiConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [retryingCvId, setRetryingCvId] = useState<string | null>(null);
  const [deletingCv, setDeletingCv] = useState<CandidateCvRecord | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [previewingCv, setPreviewingCv] = useState<CandidateCvRecord | null>(null);

  const [activeCv, setActiveCv] = useState<CandidateCvRecord | null>(null);
  const [review, setReview] = useState<ParsedCvReviewData | null>(null);
  const [draft, setDraft] = useState<ParsedCvPayload | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loadingReview, setLoadingReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const listGeneration = useRef(0);
  const mutationEpoch = useRef(0);
  const reviewRequestSeq = useRef(0);

  const dirty = Boolean(draft && JSON.stringify(draft) !== savedSnapshot);
  useUnsavedChanges(dirty, () => {
    setError("Bạn có thay đổi chưa lưu. Vui lòng lưu hoặc hủy trước khi rời trang.");
  });

  const loadCvs = useCallback(async () => {
    const seq = ++listGeneration.current;
    const epochAtStart = mutationEpoch.current;
    setLoading(true);
    try {
      const items = await apiRequest<CandidateCvRecord[]>("/api/v2/cvs", {
        accessToken: session.accessToken
      });
      if (seq !== listGeneration.current || epochAtStart !== mutationEpoch.current) return;
      const activeItems = items.filter((cv) => cv.status === "ACTIVE");
      setCvs((current) =>
        activeItems.map((incoming) => {
          const existing = current.find((item) => item.cvId === incoming.cvId);
          if (
            existing &&
            existing.activeVersion.cvVersionId === incoming.activeVersion.cvVersionId &&
            existing.activeVersion.version > incoming.activeVersion.version
          ) {
            return existing;
          }
          return incoming;
        })
      );
      setError(null);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        onLogout?.();
      } else {
        setError(getErrorMessage(requestError));
      }
    } finally {
      if (seq === listGeneration.current) setLoading(false);
    }
  }, [onLogout, session.accessToken]);

  const loadDrafts = useCallback(async () => {
    try {
      const items = await apiRequest<unknown>("/api/v2/cvs/drafts", {
        accessToken: session.accessToken
      });
      if (Array.isArray(items)) {
        setServerDrafts(items.filter(isCvDraftRecord));
      }
    } catch {
      // Keep CV library functional even if draft listing is unavailable.
    }
  }, [session.accessToken]);

  useEffect(() => {
    void loadCvs();
    void loadDrafts();
  }, [loadCvs, loadDrafts]);

  useEffect(() => {
    if (!cvs.some((cv) => pendingCvStatuses.includes(cv.activeVersion.processingStatus))) return;
    const timer = window.setInterval(() => {
      void loadCvs();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [cvs, loadCvs]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;
    setError(null);
    setUploadMessage(null);

    if (!selectedFile) {
      setError("Vui lòng chọn một tệp PDF.");
      return;
    }
    if (selectedFile.size === 0) {
      setError("File PDF phải có nội dung.");
      return;
    }
    if (selectedFile.size > MAX_CV_BYTES) {
      setError("Kích thước tệp vượt quá giới hạn 10 MiB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (title.trim()) formData.append("title", title.trim());
    formData.append("externalAiConsent", String(externalAiConsent));
    if (externalAiConsent) {
      formData.append("externalAiPolicyVersion", externalAiPolicyVersion);
    }

    setUploading(true);
    try {
      mutationEpoch.current += 1;
      await apiRequest<CandidateCvRecord>("/api/v2/cvs", {
        method: "POST",
        accessToken: session.accessToken,
        body: formData
      });
      setTitle("");
      setSelectedFile(null);
      setFileInputKey((k) => k + 1);
      setExternalAiConsent(false);
      setUploadMessage("CV đã được lưu an toàn. Kết quả phân tích sẽ hiển thị trong danh sách bên dưới.");
      await loadCvs();
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setUploading(false);
    }
  }

  async function handleRetry(cv: CandidateCvRecord) {
    if (retryingCvId) return;
    setRetryingCvId(cv.cvId);
    setError(null);
    try {
      const updated = await apiRequest<CandidateCvRecord>(`/api/v2/cvs/${cv.cvId}/retry`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({
          cvVersionId: cv.activeVersion.cvVersionId,
          expectedVersion: cv.activeVersion.version
        })
      });
      mutationEpoch.current += 1;
      setCvs((current) => current.map((item) => (item.cvId === cv.cvId ? updated : item)));
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setRetryingCvId(null);
    }
  }

  async function openReview(cv: CandidateCvRecord) {
    if (dirty) {
      setError("Bạn có thay đổi chưa lưu. Vui lòng lưu hoặc hủy trước khi chuyển sang CV khác.");
      return;
    }
    const seq = ++reviewRequestSeq.current;
    setActiveCv(cv);
    setReview(null);
    setDraft(null);
    setSavedSnapshot("");
    setLoadingReview(true);
    setError(null);
    try {
      const result = await apiRequest<ParsedCvReviewData>(
        `/api/v2/parsed-cvs/${cv.activeVersion.cvVersionId}`,
        { accessToken: session.accessToken }
      );
      if (seq !== reviewRequestSeq.current) return;
      setReview(result);
      setDraft(result.payload);
      setSavedSnapshot(JSON.stringify(result.payload));
    } catch (requestError) {
      if (seq !== reviewRequestSeq.current) return;
      setActiveCv(null);
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      if (seq === reviewRequestSeq.current) setLoadingReview(false);
    }
  }

  function closeReview() {
    if (dirty) {
      setError("Bạn có thay đổi chưa lưu. Vui lòng lưu thay đổi trước khi đóng.");
      return;
    }
    reviewRequestSeq.current += 1;
    setActiveCv(null);
    setReview(null);
    setDraft(null);
    setSavedSnapshot("");
  }

  async function saveDraft() {
    if (!review || !draft || !activeCv || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<ParsedCvReviewData>(
        `/api/v2/parsed-cvs/${review.cvVersionId}`,
        {
          method: "PUT",
          accessToken: session.accessToken,
          body: JSON.stringify({ cvId: activeCv.cvId, expectedRevisionId: review.revisionId, payload: draft })
        }
      );
      setReview(updated);
      setDraft(updated.payload);
      setSavedSnapshot(JSON.stringify(updated.payload));
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmReview() {
    if (!review || dirty || confirming) return;
    setConfirming(true);
    setError(null);
    try {
      const confirmed = await apiRequest<ParsedCvReviewData>(
        `/api/v2/parsed-cvs/${review.cvVersionId}/confirm`,
        {
          method: "POST",
          accessToken: session.accessToken,
          body: JSON.stringify({ expectedRevisionId: review.revisionId })
        }
      );
      setReview(confirmed);
      setDraft(confirmed.payload);
      setSavedSnapshot(JSON.stringify(confirmed.payload));
      await loadCvs();
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setConfirming(false);
    }
  }

  async function confirmDeleteCv() {
    if (!deletingCv || deletingBusy) return;
    setDeletingBusy(true);
    setError(null);
    try {
      await apiRequest<void>(`/api/v2/cvs/${deletingCv.cvId}?version=${deletingCv.version}`, {
        method: "DELETE",
        accessToken: session.accessToken
      });
      mutationEpoch.current += 1;
      if (activeCv?.cvId === deletingCv.cvId) {
        reviewRequestSeq.current += 1;
        setActiveCv(null);
        setReview(null);
        setDraft(null);
        setSavedSnapshot("");
      }
      setCvs((current) => current.filter((item) => item.cvId !== deletingCv.cvId));
      setDeletingCv(null);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setDeletingBusy(false);
    }
  }

  async function confirmDeleteDraft() {
    if (!deletingDraft || deletingDraftBusy) return;
    setDeletingDraftBusy(true);
    setError(null);
    try {
      await apiRequest<void>(
        `/api/v2/cvs/drafts/${deletingDraft.draftId}?version=${deletingDraft.version}`,
        { method: "DELETE", accessToken: session.accessToken }
      );
      setServerDrafts((current) => current.filter((item) => item.draftId !== deletingDraft.draftId));
      setDeletingDraft(null);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setDeletingDraftBusy(false);
    }
  }

  async function fetchCvPdfBytes(cv: CandidateCvRecord): Promise<Uint8Array> {
    const { blob } = await apiDownload(
      `/api/v2/cvs/${cv.cvId}/file?cvVersionId=${cv.activeVersion.cvVersionId}`,
      { accessToken: session.accessToken }
    );
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function openCvInBuilder(cv: CandidateCvRecord) {
    if (openingActionKey) return;
    setOpeningActionKey(`builder:${cv.cvId}`);
    setError(null);
    try {
      const reviewData = await apiRequest<ParsedCvReviewData>(
        `/api/v2/cvs/${cv.cvId}/parsed-review?cvVersionId=${cv.activeVersion.cvVersionId}`,
        { accessToken: session.accessToken }
      );
      const base = createCvDocument();
      base.title = (cv.title || cv.activeVersion.originalFilename.replace(/\.pdf$/i, "") || "CV của tôi").slice(0, 120);
      const imported = importParsedCv(base, reviewData.payload);
      let pdfRef: { bytes: Uint8Array; title: string } | null = null;
      try {
        const bytes = await fetchCvPdfBytes(cv);
        pdfRef = { bytes, title: cv.title || cv.activeVersion.originalFilename };
      } catch {
        // Still allow structured editing if binary download is temporarily unavailable.
      }
      setEditingDraft(null);
      setInitialBuilderDoc(imported);
      setReferencePdf(pdfRef);
      setBuilderOpen(true);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setOpeningActionKey(null);
    }
  }

  async function openCvInOverlayEditor(cv: CandidateCvRecord) {
    if (openingActionKey) return;
    setOpeningActionKey(`overlay:${cv.cvId}`);
    setError(null);
    try {
      const bytes = await fetchCvPdfBytes(cv);
      setOverlayEditor({
        initialBytes: bytes,
        initialTitle: cv.title || cv.activeVersion.originalFilename.replace(/\.pdf$/i, "") || "CV chỉnh sửa trực tiếp",
      });
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setOpeningActionKey(null);
    }
  }

  async function duplicateServerDraft(item: CvDraftRecord) {
    if (openingActionKey) return;
    setOpeningActionKey(`dup:${item.draftId}`);
    setError(null);
    try {
      const sourceDoc = fromServerDraft(item);
      sourceDoc.title = `${item.title} (Bản sao)`.slice(0, 120);
      const saved = await apiRequest<CvDraftRecord>("/api/v2/cvs/drafts", {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify(toServerDraftRequest(sourceDoc, 0)),
      });
      setServerDrafts((current) => [saved, ...current]);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout?.();
      else setError(getErrorMessage(requestError));
    } finally {
      setOpeningActionKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
            THƯ VIỆN HỒ SƠ PDF
          </p>
          <h2 className="text-xl font-bold text-ink-900 m-0 mt-0.5">CV của tôi</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={dirty}
            onClick={() => {
              setEditingDraft(null);
              setInitialBuilderDoc(null);
              setReferencePdf(null);
              setBuilderOpen(true);
            }}
          >
            Tạo CV theo mẫu
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={dirty}
            onClick={() => {
              setOverlayEditor({ initialBytes: null, initialTitle: "CV chỉnh sửa PDF trực tiếp" });
            }}
          >
            Sửa file PDF trực tiếp
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void loadCvs();
              void loadDrafts();
            }}
            disabled={loading}
          >
            Làm mới
          </Button>
        </div>
      </div>

      {error && <ErrorBanner tone="error" message={error} />}
      {uploadMessage && (
        <p
          className="success-message rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 m-0"
          role="status"
        >
          {uploadMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2" role="tablist" aria-label="Phân khu quản lý CV">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "library"}
            onClick={() => setWorkspaceTab("library")}
            className={`cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              workspaceTab === "library"
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-ink-700 hover:bg-slate-200"
            }`}
          >
            CV &amp; Bản nháp của tôi ({cvs.length + serverDrafts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === "templates"}
            onClick={() => setWorkspaceTab("templates")}
            className={`cursor-pointer rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              workspaceTab === "templates"
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-ink-700 hover:bg-slate-200"
            }`}
          >
            Kho mẫu CV
          </button>
        </div>
      </div>

      {workspaceTab === "templates" ? (
        <Card padding="lg">
          <CvTemplateGallery
            onSelectTemplate={(templateId, accentColor) => setPreviewTemplate({ templateId, accentColor })}
          />
        </Card>
      ) : (
        <>
          {serverDrafts.length > 0 && (
            <section aria-label="Bản nháp CV đã lưu" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-ink-900 m-0">Bản nháp CV tự tạo</h3>
                  <p className="text-xs text-ink-500 m-0">Mở lại để chỉnh sửa trực tiếp trên CV hoặc xuất PDF mới.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setWorkspaceTab("templates")}
                >
                  Đổi mẫu trong kho mẫu
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {serverDrafts.map((item) => (
                  <Card key={item.draftId} as="article" padding="md" className="flex flex-col justify-between gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-ink-900 m-0 truncate">{item.title}</h4>
                        <p className="text-xs text-ink-500 m-0 mt-0.5">
                          Mẫu {templateLabels[item.templateId] ?? item.templateId} · Phiên bản {item.version + 1}
                        </p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-5 shrink-0 flex-col gap-0.5 rounded border border-slate-200 bg-white p-0.5"
                      >
                        <span className="h-1 w-full rounded-[1px]" style={{ backgroundColor: item.accentColor }} />
                        <span className="h-0.5 w-3/4 rounded-[1px] bg-slate-200" />
                        <span className="h-0.5 w-full rounded-[1px] bg-slate-200" />
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={dirty}
                          onClick={() => {
                            setEditingDraft(item);
                            setInitialBuilderDoc(null);
                            setReferencePdf(null);
                            setBuilderOpen(true);
                          }}
                        >
                          Chỉnh sửa tiếp
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={dirty || openingActionKey !== null}
                          onClick={() => void duplicateServerDraft(item)}
                        >
                          {openingActionKey === `dup:${item.draftId}` ? "Đang nhân bản…" : "Nhân bản"}
                        </Button>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => setDeletingDraft(item)}
                      >
                        Xóa bản nháp
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <UploadIcon size={18} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-base font-bold text-ink-900 m-0">Tải CV mới</h3>
            <p className="text-xs text-ink-500 m-0">
              Định dạng PDF tối đa 10 MiB. AI trích xuất thông tin và chỉ sử dụng khi bạn xác nhận.
            </p>
          </div>
        </div>

        <form aria-label="Tải CV mới" onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm font-medium text-ink-800">
              Tên CV (tuỳ chọn)
              <input
                type="text"
                maxLength={180}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ví dụ: Backend Java CV 2026"
                className="mt-1.5 h-10 w-full rounded-xl border border-border-strong bg-white px-3.5 text-sm text-ink-900 focus:border-brand-600 focus:outline-none"
              />
            </label>

            <label className="block text-sm font-medium text-ink-800">
              File PDF (tối đa 10 MiB)
              <input
                key={fileInputKey}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full rounded-xl border border-dashed border-border-strong bg-slate-50/70 px-3 py-2 text-xs text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
              />
            </label>
          </div>

          <ExternalAiConsent checked={externalAiConsent} onChange={setExternalAiConsent} />

          <div className="flex justify-end">
            <Button type="submit" disabled={uploading}>
              {uploading ? "Đang tải lên…" : "Tải CV lên"}
            </Button>
          </div>
        </form>
      </Card>

      {loading && cvs.length === 0 ? (
        <Card padding="lg" role="status">
          <p className="text-sm text-ink-500 text-center m-0">Đang tải danh sách CV…</p>
        </Card>
      ) : cvs.length === 0 ? (
        <EmptyState
          icon={<CvIcon size={24} />}
          title="Chưa có CV nào trong thư viện"
          description="Tải lên bản CV PDF đầu tiên để AI bóc tách kỹ năng và kinh nghiệm."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cvs.map((cv) => {
            const st = cv.activeVersion.processingStatus;
            const retryable = canRetryCv(st, cv.activeVersion.failureCode);
            const reviewable = st === "CONFIRMED" || reviewCvStatuses.includes(st);
            const isFailed = st === "FAILED" || st === "REJECTED";
            return (
              <Card key={cv.cvId} as="article" padding="md" className="cv-item flex flex-col justify-between gap-4">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-ink-900 m-0 truncate">{cv.title}</h3>
                      <p className="text-xs text-ink-500 m-0 mt-0.5 truncate">
                        {cv.activeVersion.originalFilename} · {formatBytes(cv.activeVersion.sizeBytes)}
                      </p>
                    </div>
                    <Badge tone={statusBadgeTone(st)}>{cvStatusLabels[st] ?? st}</Badge>
                  </div>

                  {isFailed && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 m-0">
                      {cvFailureInstruction(cv.activeVersion.failureCode)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border-subtle">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setPreviewingCv(cv)}
                    >
                      <EyeIcon size={14} aria-hidden="true" />
                      <span>Xem PDF</span>
                    </Button>

                    {reviewable && (
                      <>
                        <Button type="button" size="sm" onClick={() => void openReview(cv)}>
                          Xem bản phân tích
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={dirty || openingActionKey !== null}
                          onClick={() => void openCvInBuilder(cv)}
                        >
                          {openingActionKey === `builder:${cv.cvId}` ? "Đang mở…" : "Tinh chỉnh bằng CV Builder"}
                        </Button>
                      </>
                    )}

                    {st !== "FAILED" && st !== "REJECTED" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={dirty || openingActionKey !== null}
                        onClick={() => void openCvInOverlayEditor(cv)}
                      >
                        {openingActionKey === `overlay:${cv.cvId}` ? "Đang tải PDF…" : "Sửa trực tiếp trên PDF"}
                      </Button>
                    )}

                    {retryable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={retryingCvId === cv.cvId}
                        onClick={() => void handleRetry(cv)}
                      >
                        {retryingCvId === cv.cvId ? "Đang gửi yêu cầu…" : "Thử lại"}
                      </Button>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => setDeletingCv(cv)}
                  >
                    <TrashIcon size={13} aria-hidden="true" />
                    <span>Xóa CV</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {activeCv && (
        <section aria-label="Kiểm tra bản phân tích CV" className="pt-2">
          <DocumentReview
            title={`CV gốc: ${activeCv.activeVersion.originalFilename}`}
            source={
              <PdfSource
                path={`/api/v2/cvs/${activeCv.cvId}/file?cvVersionId=${activeCv.activeVersion.cvVersionId}`}
                accessToken={session.accessToken}
                filename={activeCv.activeVersion.originalFilename}
              />
            }
          >
            {loadingReview || !review || !draft ? (
              <Card padding="lg" role="status">
                <p className="text-sm text-ink-500 text-center m-0">Đang tải dữ liệu phân tích CV…</p>
              </Card>
            ) : (
              <ParsedCvReview
                review={review}
                draft={draft}
                dirty={dirty}
                saving={saving}
                confirming={confirming}
                onDraftChange={setDraft}
                onSave={() => void saveDraft()}
                onConfirm={() => void confirmReview()}
                onClose={closeReview}
              />
            )}
          </DocumentReview>
        </section>
      )}

      {previewingCv && (
        <CvPreviewModal
          open={true}
          onClose={() => setPreviewingCv(null)}
          title={previewingCv.title}
          filename={previewingCv.activeVersion.originalFilename}
          downloadPath={`/api/v2/cvs/${previewingCv.cvId}/file?cvVersionId=${previewingCv.activeVersion.cvVersionId}`}
          accessToken={session.accessToken}
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingCv)}
        title="Xóa CV"
        description={
          deletingCv
            ? `Bạn chắc chắn muốn xóa CV "${deletingCv.title}"? Dữ liệu tệp và phân tích liên quan sẽ bị thu hồi khỏi thư viện.`
            : ""
        }
        confirmLabel={deletingBusy ? "Đang xóa…" : "Xác nhận xóa CV"}
        busy={deletingBusy}
        onCancel={() => {
          if (!deletingBusy) setDeletingCv(null);
        }}
        onConfirm={() => void confirmDeleteCv()}
      />

      <ConfirmDialog
        open={Boolean(deletingDraft)}
        title="Xóa bản nháp CV"
        description={
          deletingDraft
            ? `Bạn chắc chắn muốn xóa bản nháp "${deletingDraft.title}"? Thao tác này không ảnh hưởng các CV PDF đã tải lên thư viện.`
            : ""
        }
        confirmLabel={deletingDraftBusy ? "Đang xóa…" : "Xác nhận xóa bản nháp"}
        busy={deletingDraftBusy}
        onCancel={() => {
          if (!deletingDraftBusy) setDeletingDraft(null);
        }}
        onConfirm={() => void confirmDeleteDraft()}
      />
        </>
      )}

      <CvTemplatePreviewModal
        open={Boolean(previewTemplate)}
        templateId={previewTemplate?.templateId ?? null}
        initialAccentColor={previewTemplate?.accentColor ?? "#0f766e"}
        session={session}
        cvs={cvs}
        serverDrafts={serverDrafts}
        onClose={() => setPreviewTemplate(null)}
        onCreate={(doc) => {
          setPreviewTemplate(null);
          setEditingDraft(null);
          setInitialBuilderDoc(doc);
          setReferencePdf(null);
          setBuilderOpen(true);
        }}
        onLogout={onLogout}
      />

      {builderOpen && <Suspense fallback={<p role="status">Đang mở trình tạo CV…</p>}>
        <CvBuilder
          key={session.userId}
          session={session}
          cvs={cvs}
          initialDraft={editingDraft}
          initialDoc={initialBuilderDoc}
          initialReferencePdfBytes={referencePdf?.bytes ?? null}
          initialReferencePdfTitle={referencePdf?.title}
          onDraftSaved={(saved) => {
            setEditingDraft(saved);
            setInitialBuilderDoc(null);
            setServerDrafts((current) => [saved, ...current.filter((item) => item.draftId !== saved.draftId)]);
          }}
          onCvUploaded={() => void loadCvs()}
          onSwitchToOverlayEditor={(bytes, docTitle) => {
            setBuilderOpen(false);
            setOverlayEditor({ initialBytes: bytes, initialTitle: docTitle || "CV chỉnh sửa PDF trực tiếp" });
          }}
          onClose={() => {
            setBuilderOpen(false);
            setInitialBuilderDoc(null);
            setReferencePdf(null);
          }}
          onLogout={onLogout}
        />
      </Suspense>}

      {overlayEditor && <Suspense fallback={<p role="status">Đang mở trình sửa file PDF…</p>}>
        <PdfOverlayEditor
          session={session}
          initialBytes={overlayEditor.initialBytes}
          initialTitle={overlayEditor.initialTitle}
          onCvUploaded={() => {
            void loadCvs();
            setUploadMessage("Đã lưu phiên bản CV PDF chỉnh sửa vào thư viện.");
          }}
          onClose={() => setOverlayEditor(null)}
          onLogout={onLogout}
        />
      </Suspense>}
    </div>
  );
}
