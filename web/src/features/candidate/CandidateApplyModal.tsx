import { FormEvent, useEffect, useRef, useState } from "react";

import { UploadIcon } from "../../shared/components/Icon";
import { Button, ErrorBanner, Modal } from "../../shared/ui";
import {
  Cv,
  Job,
  employmentTypeLabel,
  inputClass,
  workModeLabel
} from "./candidateJobTypes";
import { QuickCvUploadSection } from "./QuickCvUploadSection";

/** CV selection, inline quick CV upload, cover letter, and privacy-consent modal for submitting a job application. */
export function CandidateApplyModal({
  pendingJob,
  confirmedCvs,
  selectedCv,
  loadingCvs = false,
  cvLoadError = null,
  cvSelectionWarning = null,
  accessToken,
  uploadPollIntervalMs,
  confirmSyncIntervalMs,
  coverLetter,
  consentAccepted,
  submitting,
  error,
  onClose,
  onSelectCv,
  onCvConfirmed,
  onRetryLoadCvs,
  onOpenCvLibrary,
  onCoverLetterChange,
  onConsentChange,
  onPreviewCv,
  onSubmit
}: {
  pendingJob: Job | null;
  confirmedCvs: Cv[];
  selectedCv: Cv | null;
  loadingCvs?: boolean;
  cvLoadError?: string | null;
  cvSelectionWarning?: string | null;
  accessToken?: string;
  uploadPollIntervalMs?: number;
  confirmSyncIntervalMs?: number;
  coverLetter: string;
  consentAccepted: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSelectCv: (cvId: string) => void;
  onCvConfirmed?: (cv: Cv) => void;
  onRetryLoadCvs?: () => void;
  onOpenCvLibrary?: () => void;
  onCoverLetterChange: (value: string) => void;
  onConsentChange: (checked: boolean) => void;
  onPreviewCv: (cv: Cv) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const canQuickUpload = Boolean(accessToken && onCvConfirmed);
  const [cvMode, setCvMode] = useState<"select" | "upload">("select");
  const [justConfirmedMessage, setJustConfirmedMessage] = useState<string | null>(null);
  const manualModeSelection = useRef(false);

  useEffect(() => {
    setCvMode("select");
    setJustConfirmedMessage(null);
    manualModeSelection.current = false;
  }, [pendingJob?.jobId]);

  useEffect(() => {
    if (
      pendingJob &&
      canQuickUpload &&
      !loadingCvs &&
      !cvLoadError &&
      confirmedCvs.length === 0 &&
      !manualModeSelection.current
    ) {
      setCvMode("upload");
    }
  }, [pendingJob, canQuickUpload, loadingCvs, cvLoadError, confirmedCvs.length]);

  function switchMode(nextMode: "select" | "upload") {
    manualModeSelection.current = true;
    if (nextMode === "upload") setJustConfirmedMessage(null);
    setCvMode(nextMode);
  }

  function handleQuickUploadConfirmed(uploadedCv: Cv) {
    manualModeSelection.current = true;
    onCvConfirmed?.(uploadedCv);
    setCvMode("select");
    setJustConfirmedMessage(`CV "${uploadedCv.title}" đã được xác nhận và chọn sẵn để ứng tuyển.`);
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (cvMode !== "select") {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  }

  return (
    <Modal
      open={pendingJob !== null}
      onClose={onClose}
      closeDisabled={submitting}
      eyebrow="Xác nhận chia sẻ CV & ứng tuyển"
      title={pendingJob ? pendingJob.title : "Ứng tuyển vị trí"}
      description={
        pendingJob
          ? [pendingJob.locationText, workModeLabel(pendingJob.workMode), employmentTypeLabel(pendingJob.employmentType)]
              .filter(Boolean)
              .join(" · ") || undefined
          : undefined
      }
      titleId="candidate-apply-modal-title"
      size="md"
    >
      {pendingJob && (
        <form onSubmit={handleFormSubmit} className="pt-4 space-y-4">
          {error && <ErrorBanner tone="error" message={error} />}

          <div className="space-y-3">
            {canQuickUpload && !loadingCvs && !cvLoadError && (
              <div
                role="tablist"
                aria-label="Phương thức chọn CV ứng tuyển"
                className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={cvMode === "select"}
                  onClick={() => switchMode("select")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer border-0 ${
                    cvMode === "select"
                      ? "bg-white text-brand-700 shadow-xs"
                      : "bg-transparent text-ink-600 hover:text-ink-900"
                  }`}
                >
                  <span>Chọn CV có sẵn ({confirmedCvs.length})</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cvMode === "upload"}
                  onClick={() => switchMode("upload")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer border-0 ${
                    cvMode === "upload"
                      ? "bg-white text-brand-700 shadow-xs"
                      : "bg-transparent text-ink-600 hover:text-ink-900"
                  }`}
                >
                  <UploadIcon size={14} aria-hidden="true" />
                  <span>Tải CV mới lên</span>
                </button>
              </div>
            )}

            {cvMode === "upload" && accessToken && onCvConfirmed ? (
              <div className="space-y-2.5">
                {confirmedCvs.length === 0 && (
                  <p className="text-xs text-ink-600 m-0 leading-relaxed">
                    Bạn chưa có CV nào đã xác nhận trong thư viện — hãy tải tệp PDF lên ngay bên dưới để phân tích, xác nhận và ứng tuyển trực tiếp.
                  </p>
                )}
                <QuickCvUploadSection
                  key={pendingJob.jobId}
                  accessToken={accessToken}
                  pollIntervalMs={uploadPollIntervalMs}
                  confirmSyncIntervalMs={confirmSyncIntervalMs}
                  onCvConfirmed={handleQuickUploadConfirmed}
                  onPreviewCv={onPreviewCv}
                  onOpenCvLibrary={onOpenCvLibrary}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="candidate-apply-cv-select" className="text-sm font-semibold text-ink-800">
                    Chọn CV đã xác nhận
                  </label>
                  <div className="flex items-center gap-3">
                    {selectedCv && (
                      <button
                        type="button"
                        onClick={() => onPreviewCv(selectedCv)}
                        className="text-xs font-semibold text-brand-700 hover:text-brand-800 cursor-pointer bg-transparent border-0 p-0"
                      >
                        👁 Xem CV
                      </button>
                    )}
                    {canQuickUpload && confirmedCvs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => switchMode("upload")}
                        className="text-xs font-semibold text-ink-600 hover:text-brand-700 cursor-pointer bg-transparent border-0 p-0"
                      >
                        + Tải CV mới
                      </button>
                    )}
                  </div>
                </div>
                {loadingCvs ? (
                  <p role="status" className="text-sm text-ink-500 m-0 py-2">
                    Đang tải danh sách CV đã xác nhận…
                  </p>
                ) : cvLoadError ? (
                  <ErrorBanner
                    tone="error"
                    message={cvLoadError}
                    action={
                      onRetryLoadCvs ? (
                        <Button type="button" size="sm" variant="secondary" onClick={onRetryLoadCvs}>
                          Thử lại
                        </Button>
                      ) : undefined
                    }
                  />
                ) : confirmedCvs.length === 0 ? (
                  <ErrorBanner
                    tone="warning"
                    message="Bạn chưa có CV ở trạng thái CONFIRMED. Hãy tải và xác nhận bản phân tích CV trước khi ứng tuyển."
                    action={
                      <div className="flex flex-wrap gap-2">
                        {canQuickUpload && (
                          <Button type="button" size="sm" onClick={() => switchMode("upload")}>
                            Tải CV mới lên ngay
                          </Button>
                        )}
                        {onOpenCvLibrary && (
                          <Button type="button" size="sm" variant="secondary" onClick={onOpenCvLibrary}>
                            Mở CV của tôi
                          </Button>
                        )}
                      </div>
                    }
                  />
                ) : (
                  <>
                    {justConfirmedMessage && <ErrorBanner tone="success" message={justConfirmedMessage} />}
                    {cvSelectionWarning && <ErrorBanner tone="warning" message={cvSelectionWarning} />}
                    <select
                      id="candidate-apply-cv-select"
                      data-modal-autofocus
                      value={selectedCv?.cvId ?? ""}
                      onChange={(event) => {
                        setJustConfirmedMessage(null);
                        onSelectCv(event.target.value);
                      }}
                      className={inputClass}
                    >
                      {!selectedCv && (
                        <option value="" disabled>
                          Chọn CV đã xác nhận…
                        </option>
                      )}
                      {confirmedCvs.map((cv) => (
                        <option key={cv.cvId} value={cv.cvId}>
                          {cv.title}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </div>

          <label className="block space-y-1.5 text-sm font-semibold text-ink-800">
            <span>Thư giới thiệu (tuỳ chọn)</span>
            <textarea
              rows={3}
              maxLength={4000}
              value={coverLetter}
              onChange={(event) => onCoverLetterChange(event.target.value)}
              placeholder="Giới thiệu ngắn gọn kinh nghiệm nổi bật hoặc lý do bạn phù hợp với vị trí này…"
              className="w-full rounded-xl border border-border-strong bg-white px-3.5 py-2.5 text-sm font-normal text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </label>

          <label className="flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/60 p-3.5 text-xs sm:text-sm text-ink-800 cursor-pointer">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(event) => onConsentChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong text-brand-600 focus:ring-brand-500"
            />
            <span>
              Tôi đồng ý chia sẻ CV đã chọn và thông tin liên hệ với nhà tuyển dụng cho vị trí này theo chính sách quyền riêng tư (phiên bản cv-sharing-v1).
            </span>
          </label>

          {cvMode === "upload" && (
            <p className="text-xs text-ink-500 m-0 text-right">
              Hoàn tất tải lên và xác nhận CV mới ở trên để bật nút Ứng tuyển.
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !consentAccepted || !selectedCv || cvMode !== "select"}>
              {submitting ? "Đang gửi…" : "Ứng tuyển"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
