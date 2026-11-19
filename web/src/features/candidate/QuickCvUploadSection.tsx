import { DragEvent, useEffect, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import {
  externalAiPolicyVersion,
  ExternalAiConsent,
  extractionNeedsManualReview
} from "../../shared/components/ExternalAiConsent";
import { CheckCircleIcon, CvIcon, EyeIcon, UploadIcon } from "../../shared/components/Icon";
import { Badge, Button, ErrorBanner } from "../../shared/ui";
import { Cv, getErrorMessage, inputClass } from "./candidateJobTypes";
import { canRetryCv, cvFailureInstruction, cvStatusLabels, reviewCvStatuses } from "./cvStatus";
import type { ParsedCvReviewData } from "./ParsedCvReview";

const MAX_CV_BYTES = 10 * 1024 * 1024;
const MAX_PARSE_POLLS = 30;
const MAX_CONFIRM_POLLS = 30;

type UploadedCvRecord = Cv & {
  activeVersion: Cv["activeVersion"] & {
    sizeBytes?: number;
    version?: number;
    failureCode?: string | null;
  };
};

type UploadStage = "pick" | "uploading" | "parsing" | "review" | "syncing" | "failed" | "timeout";

type Props = {
  accessToken: string;
  pollIntervalMs?: number;
  confirmSyncIntervalMs?: number;
  onCvConfirmed: (cv: Cv) => void;
  onPreviewCv: (cv: Cv) => void;
  onOpenCvLibrary?: () => void;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function validatePdfFile(file: File | null): string | null {
  if (!file) return "Vui lòng chọn một tệp PDF.";
  if (file.size === 0) return "File PDF phải có nội dung.";
  if (file.size > MAX_CV_BYTES) return "Kích thước tệp vượt quá giới hạn 10 MiB.";
  const isPdfMime = file.type.toLowerCase() === "application/pdf";
  const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
  if (!isPdfMime && (file.type !== "" || !isPdfExt)) {
    return "Chỉ hỗ trợ tệp định dạng PDF (.pdf).";
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Inline quick CV upload, parse polling, and fast confirmation panel for the apply modal. */
export function QuickCvUploadSection({
  accessToken,
  pollIntervalMs = 1000,
  confirmSyncIntervalMs = 600,
  onCvConfirmed,
  onPreviewCv,
  onOpenCvLibrary
}: Props) {
  const [stage, setStage] = useState<UploadStage>("pick");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [title, setTitle] = useState("");
  const [externalAiConsent, setExternalAiConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadedCv, setUploadedCv] = useState<UploadedCvRecord | null>(null);
  const [parsedReview, setParsedReview] = useState<ParsedCvReviewData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, []);

  function startController(): AbortController {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    return controller;
  }

  function resetToPick() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setStage("pick");
    setSelectedFile(null);
    setFileInputKey((k) => k + 1);
    setTitle("");
    setExternalAiConsent(false);
    setLocalError(null);
    setUploadedCv(null);
    setParsedReview(null);
    setConfirming(false);
    setRetrying(false);
  }

  function handleFilePicked(file: File | null) {
    setLocalError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validation = validatePdfFile(file);
    if (validation) {
      setSelectedFile(null);
      setFileInputKey((k) => k + 1);
      setLocalError(validation);
      return;
    }
    setSelectedFile(file);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    handleFilePicked(event.dataTransfer.files?.[0] ?? null);
  }

  async function loadParsedForReview(cv: UploadedCvRecord, signal: AbortSignal): Promise<ParsedCvReviewData | null> {
    try {
      return await apiRequest<ParsedCvReviewData>(
        `/api/v2/parsed-cvs/${cv.activeVersion.cvVersionId}`,
        { accessToken, signal }
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async function pollUntilReadyForReview(initialCv: UploadedCvRecord, controller: AbortController) {
    setUploadedCv(initialCv);
    setStage("parsing");
    let latest = initialCv;

    for (let attempt = 0; attempt < MAX_PARSE_POLLS; attempt++) {
      if (attempt > 0) {
        await wait(pollIntervalMs, controller.signal);
        latest = await apiRequest<UploadedCvRecord>(`/api/v2/cvs/${latest.cvId}`, {
          accessToken,
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        setUploadedCv(latest);
      }

      const status = latest.activeVersion.processingStatus;
      if (status === "CONFIRMED") {
        onCvConfirmed(latest);
        return;
      }
      if (status === "FAILED" || status === "REJECTED") {
        setStage("failed");
        setLocalError(cvFailureInstruction(latest.activeVersion.failureCode ?? null));
        return;
      }
      if (reviewCvStatuses.includes(status)) {
        const parsed = await loadParsedForReview(latest, controller.signal);
        if (controller.signal.aborted) return;
        if (parsed) {
          setParsedReview(parsed);
          setStage("review");
          return;
        }
      }
    }

    setStage("timeout");
  }

  async function pollUntilConfirmed(cv: UploadedCvRecord, controller: AbortController) {
    setStage("syncing");
    let latest = cv;

    for (let attempt = 0; attempt < MAX_CONFIRM_POLLS; attempt++) {
      if (attempt > 0) {
        await wait(confirmSyncIntervalMs, controller.signal);
      }
      latest = await apiRequest<UploadedCvRecord>(`/api/v2/cvs/${cv.cvId}`, {
        accessToken,
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      setUploadedCv(latest);

      const status = latest.activeVersion.processingStatus;
      if (status === "CONFIRMED") {
        onCvConfirmed(latest);
        return;
      }
      if (status === "FAILED" || status === "REJECTED") {
        setStage("failed");
        setLocalError(cvFailureInstruction(latest.activeVersion.failureCode ?? null));
        return;
      }
    }

    setStage("timeout");
  }

  async function handleUpload() {
    const validation = validatePdfFile(selectedFile);
    if (validation || !selectedFile) {
      setLocalError(validation ?? "Vui lòng chọn một tệp PDF.");
      return;
    }

    const controller = startController();
    setLocalError(null);
    setStage("uploading");

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (title.trim()) formData.append("title", title.trim());
    formData.append("externalAiConsent", String(externalAiConsent));
    if (externalAiConsent) {
      formData.append("externalAiPolicyVersion", externalAiPolicyVersion);
    }

    try {
      const created = await apiRequest<UploadedCvRecord>("/api/v2/cvs", {
        method: "POST",
        accessToken,
        body: formData,
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      await pollUntilReadyForReview(created, controller);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setStage("pick");
      setLocalError(getErrorMessage(error));
    }
  }

  async function handleConfirmParsed() {
    if (!uploadedCv || !parsedReview || confirming) return;
    const controller = startController();
    setConfirming(true);
    setLocalError(null);
    try {
      await apiRequest<ParsedCvReviewData>(
        `/api/v2/parsed-cvs/${parsedReview.cvVersionId}/confirm`,
        {
          method: "POST",
          accessToken,
          body: JSON.stringify({ expectedRevisionId: parsedReview.revisionId }),
          signal: controller.signal
        }
      );
      if (controller.signal.aborted) return;
      await pollUntilConfirmed(uploadedCv, controller);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setLocalError(getErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) setConfirming(false);
    }
  }

  async function handleRetryFailed() {
    if (!uploadedCv || retrying) return;
    const controller = startController();
    setRetrying(true);
    setLocalError(null);
    try {
      const retried = await apiRequest<UploadedCvRecord>(`/api/v2/cvs/${uploadedCv.cvId}/retry`, {
        method: "POST",
        accessToken,
        body: JSON.stringify({
          cvVersionId: uploadedCv.activeVersion.cvVersionId,
          expectedVersion: uploadedCv.activeVersion.version ?? 0
        }),
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      await pollUntilReadyForReview(retried, controller);
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setLocalError(getErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) setRetrying(false);
    }
  }

  async function handleRecheckStatus() {
    if (!uploadedCv) return;
    const controller = startController();
    setLocalError(null);
    try {
      const latest = await apiRequest<UploadedCvRecord>(`/api/v2/cvs/${uploadedCv.cvId}`, {
        accessToken,
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      if (parsedReview && stage === "timeout") {
        await pollUntilConfirmed(latest, controller);
      } else {
        await pollUntilReadyForReview(latest, controller);
      }
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setLocalError(getErrorMessage(error));
    }
  }

  if (stage === "uploading" || stage === "parsing" || stage === "syncing") {
    const status = uploadedCv?.activeVersion.processingStatus ?? "UPLOADED";
    const statusText =
      stage === "uploading"
        ? "Đang tải tệp CV lên hệ thống…"
        : stage === "syncing"
          ? "Đang đồng bộ trạng thái CV đã xác nhận…"
          : "AI đang đọc và phân tích CV của bạn…";

    return (
      <div
        role="status"
        className="rounded-lg border border-brand-200 bg-brand-50/45 p-4 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            <span className="text-sm font-semibold text-ink-900 truncate">
              {uploadedCv?.title ?? selectedFile?.name ?? "CV mới"}
            </span>
          </div>
          {stage !== "uploading" && (
            <Badge tone="info">{cvStatusLabels[status] ?? status}</Badge>
          )}
        </div>
        <p className="text-xs text-ink-600 m-0 leading-relaxed">{statusText}</p>
      </div>
    );
  }

  if (stage === "review" && uploadedCv && parsedReview) {
    const skills = parsedReview.payload.skills ?? [];
    const experiences = parsedReview.payload.experiences ?? [];
    const education = parsedReview.payload.education ?? [];
    const languages = parsedReview.payload.languages ?? [];
    const totalMonths = parsedReview.payload.summary?.totalExperienceMonths ?? 0;
    const incomplete = extractionNeedsManualReview(parsedReview.payload.summary?.qualityFlags ?? []);
    const emptyExtraction = skills.length === 0 && experiences.length === 0;

    return (
      <div className="rounded-lg border border-brand-200 bg-white p-4 space-y-3">
        {localError && <ErrorBanner tone="error" message={localError} />}

        <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-border-subtle">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-ink-900 truncate">{uploadedCv.title}</span>
              <Badge tone="warning">Chờ xác nhận</Badge>
            </div>
            <p className="text-xs text-ink-500 m-0 mt-0.5">
              Kiểm tra nhanh dữ liệu AI trích xuất rồi bấm xác nhận để dùng CV này ứng tuyển.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onPreviewCv(uploadedCv)}
          >
            <EyeIcon size={14} aria-hidden="true" />
            <span>Xem PDF</span>
          </Button>
        </div>

        {(incomplete || emptyExtraction) && (
          <ErrorBanner
            tone="warning"
            message={
              emptyExtraction
                ? "AI chưa trích xuất được kỹ năng hoặc kinh nghiệm từ tệp PDF này (có thể do bố cục hoặc bản scan). Bạn vẫn có thể xác nhận để đính kèm PDF gốc hoặc mở CV của tôi để bổ sung thủ công."
                : "Phân tích tự động chưa đầy đủ, bạn có thể xác nhận ngay hoặc mở CV của tôi để bổ sung chi tiết."
            }
          />
        )}

        <div className="space-y-2 text-xs text-ink-700">
          {skills.length > 0 && (
            <div className="space-y-1.5">
              <span className="font-semibold text-ink-800">Kỹ năng trích xuất ({skills.length}):</span>
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, 12).map((skill, index) => (
                  <span
                    key={`${skill.raw}-${index}`}
                    className="rounded-md border border-border-subtle bg-slate-50 px-2 py-0.5 text-xs font-medium text-ink-800"
                  >
                    {skill.raw}
                  </span>
                ))}
                {skills.length > 12 && (
                  <span className="text-xs text-ink-500 self-center">
                    +{skills.length - 12} kỹ năng khác
                  </span>
                )}
              </div>
            </div>
          )}

          <p className="m-0 text-xs text-ink-600">
            <strong className="font-semibold text-ink-800">Tóm tắt hồ sơ:</strong>{" "}
            {experiences.length} kinh nghiệm ({totalMonths} tháng) · {education.length} học vấn ·{" "}
            {languages.length} ngoại ngữ
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={confirming}
              onClick={() => void handleConfirmParsed()}
            >
              <CheckCircleIcon size={14} aria-hidden="true" />
              <span>{confirming ? "Đang xác nhận…" : "Xác nhận & chọn CV này"}</span>
            </Button>
            {onOpenCvLibrary && (
              <Button type="button" size="sm" variant="secondary" onClick={onOpenCvLibrary}>
                Chỉnh sửa ở CV của tôi
              </Button>
            )}
          </div>
          <Button type="button" size="sm" variant="ghost" disabled={confirming} onClick={resetToPick}>
            Chọn tệp khác
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "failed" || stage === "timeout") {
    const retryable = Boolean(
      uploadedCv && canRetryCv(uploadedCv.activeVersion.processingStatus, uploadedCv.activeVersion.failureCode ?? null)
    );
    return (
      <div className="space-y-3">
        <ErrorBanner
          tone={stage === "failed" ? "error" : "warning"}
          message={
            stage === "failed"
              ? localError ?? "Chưa phân tích được CV."
              : "Quá trình phân tích mất nhiều thời gian hơn dự kiến. Bạn có thể kiểm tra lại ngay hoặc theo dõi trong mục CV của tôi."
          }
          action={
            <div className="flex flex-wrap gap-2">
              {stage === "timeout" && (
                <Button type="button" size="sm" variant="secondary" onClick={() => void handleRecheckStatus()}>
                  Kiểm tra lại
                </Button>
              )}
              {retryable && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={retrying}
                  onClick={() => void handleRetryFailed()}
                >
                  {retrying ? "Đang thử lại…" : "Thử phân tích lại"}
                </Button>
              )}
              {onOpenCvLibrary && (
                <Button type="button" size="sm" variant="secondary" onClick={onOpenCvLibrary}>
                  Mở CV của tôi
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={resetToPick}>
                Chọn tệp khác
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-slate-50/60 p-3.5 space-y-3">
      {localError && <ErrorBanner tone="error" message={localError} />}

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-4 text-center transition cursor-pointer ${
          dragging
            ? "border-brand-500 bg-brand-50/70"
            : "border-border-strong bg-white hover:border-brand-400 hover:bg-brand-50/30"
        }`}
      >
        <input
          key={fileInputKey}
          type="file"
          accept=".pdf,application/pdf"
          aria-label="File PDF CV (tối đa 10 MiB)"
          onChange={(event) => handleFilePicked(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {selectedFile ? (
          <CvIcon size={18} className="text-brand-700 shrink-0" aria-hidden="true" />
        ) : (
          <UploadIcon size={18} className="text-brand-700 shrink-0" aria-hidden="true" />
        )}
        {selectedFile ? (
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-ink-900 m-0 break-all">{selectedFile.name}</p>
            <p className="text-xs text-ink-500 m-0">
              {formatFileSize(selectedFile.size)} · Bấm để chọn tệp PDF khác
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-ink-800 m-0">
              Chọn CV PDF từ máy tính hoặc kéo thả vào đây
            </p>
            <p className="text-xs text-ink-500 m-0">Định dạng .pdf, dung lượng tối đa 10 MiB</p>
          </div>
        )}
      </label>

      <label className="block space-y-1 text-xs font-semibold text-ink-800">
        <span>Tên CV mới (tuỳ chọn)</span>
        <input
          type="text"
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ví dụ: Backend Java CV 2026"
          className={inputClass}
        />
      </label>

      <ExternalAiConsent checked={externalAiConsent} onChange={setExternalAiConsent} />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        {onOpenCvLibrary ? (
          <button
            type="button"
            onClick={onOpenCvLibrary}
            className="text-xs font-semibold text-ink-600 hover:text-brand-700 underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer"
          >
            Hoặc mở thư viện CV của tôi
          </button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" disabled={!selectedFile} onClick={() => void handleUpload()}>
          <UploadIcon size={14} aria-hidden="true" />
          <span>Tải lên &amp; phân tích CV</span>
        </Button>
      </div>
    </div>
  );
}
