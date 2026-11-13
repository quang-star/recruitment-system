import { FormEvent } from "react";

import { Button, ErrorBanner, Modal } from "../../shared/ui";
import {
  Cv,
  Job,
  employmentTypeLabel,
  inputClass,
  workModeLabel
} from "./candidateJobTypes";

/** CV selection, cover letter, and privacy-consent modal for submitting a job application. */
export function CandidateApplyModal({
  pendingJob,
  confirmedCvs,
  selectedCv,
  coverLetter,
  consentAccepted,
  submitting,
  error,
  onClose,
  onSelectCv,
  onCoverLetterChange,
  onConsentChange,
  onPreviewCv,
  onSubmit
}: {
  pendingJob: Job | null;
  confirmedCvs: Cv[];
  selectedCv: Cv | null;
  coverLetter: string;
  consentAccepted: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSelectCv: (cvId: string) => void;
  onCoverLetterChange: (value: string) => void;
  onConsentChange: (checked: boolean) => void;
  onPreviewCv: (cv: Cv) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
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
        <form onSubmit={onSubmit} className="pt-4 space-y-4">
          {error && <ErrorBanner tone="error" message={error} />}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="candidate-apply-cv-select" className="text-sm font-semibold text-ink-800">
                Chọn CV đã xác nhận
              </label>
              {selectedCv && (
                <button
                  type="button"
                  onClick={() => onPreviewCv(selectedCv)}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 cursor-pointer bg-transparent border-0 p-0"
                >
                  👁 Xem CV
                </button>
              )}
            </div>
            {confirmedCvs.length === 0 ? (
              <ErrorBanner
                tone="warning"
                message="Bạn chưa có CV ở trạng thái CONFIRMED. Hãy tải và xác nhận bản phân tích CV trong mục CV của tôi trước khi ứng tuyển."
              />
            ) : (
              <select
                id="candidate-apply-cv-select"
                data-modal-autofocus
                value={selectedCv?.cvId ?? ""}
                onChange={(event) => onSelectCv(event.target.value)}
                className={inputClass}
              >
                {confirmedCvs.map((cv) => (
                  <option key={cv.cvId} value={cv.cvId}>
                    {cv.title}
                  </option>
                ))}
              </select>
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

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !consentAccepted || !selectedCv}>
              {submitting ? "Đang gửi…" : "Ứng tuyển"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
