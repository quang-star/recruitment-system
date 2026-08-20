import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

type CandidateCv = {
  cvId: string;
  title: string;
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  activeVersion: {
    cvVersionId: string;
    versionNumber: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    processingStatus: "UPLOADED" | "QUEUED" | "PROCESSING" | "PARSED" | "NEEDS_REVIEW"
      | "CONFIRMED" | "REJECTED" | "FAILED" | "SUPERSEDED" | "DELETED";
    failureCode: string | null;
  };
};

type CandidateCvPanelProps = {
  session: AuthSession;
};

type ParsedCvReview = {
  revisionId: string;
  cvVersionId: string;
  revisionNumber: number;
  sourceHash: string;
  status: "PARSED" | "CONFIRMED" | "SUPERSEDED";
  payload: {
    skills?: Array<{ raw: string; confidence: number }>;
    experiences?: Array<{ titleRaw: string; confidence: number }>;
    summary?: { overallConfidence: number; qualityFlags: string[] };
  };
};

export function CandidateCvPanel({ session }: CandidateCvPanelProps) {
  const [cvs, setCvs] = useState<CandidateCv[]>([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ParsedCvReview>>({});
  const [reviewingVersionId, setReviewingVersionId] = useState<string | null>(null);
  const [confirmingVersionId, setConfirmingVersionId] = useState<string | null>(null);

  async function loadCvs() {
    try {
      const result = await apiRequest<CandidateCv[]>("/api/v1/cvs", { accessToken: session.accessToken });
      setCvs(result);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCvs();
  }, [session.accessToken]);

  useEffect(() => {
    const hasPendingCv = cvs.some((cv) => ["UPLOADED", "QUEUED", "PROCESSING"].includes(
      cv.activeVersion.processingStatus));
    if (!hasPendingCv) return;
    const timer = window.setInterval(() => void loadCvs(), 2000);
    return () => window.clearInterval(timer);
  }, [cvs, session.accessToken]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    if (title.trim()) body.append("title", title.trim());

    try {
      const created = await apiRequest<CandidateCv>("/api/v1/cvs", {
        method: "POST",
        accessToken: session.accessToken,
        body
      });
      setCvs((current) => [created, ...current]);
      setFile(null);
      setTitle("");
      const input = document.getElementById("cv-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage("CV đã được lưu an toàn và đang được phân tích.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setUploading(false);
    }
  }

  async function loadReview(cvVersionId: string) {
    setError(null);
    setReviewingVersionId(cvVersionId);
    try {
      const review = await apiRequest<ParsedCvReview>(`/api/v1/parsed-cvs/${cvVersionId}`, {
        accessToken: session.accessToken
      });
      setReviews((current) => ({ ...current, [cvVersionId]: review }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setReviewingVersionId(null);
    }
  }

  async function confirmReview(cvVersionId: string) {
    const review = reviews[cvVersionId];
    if (!review || confirmingVersionId) return;
    setError(null);
    setConfirmingVersionId(cvVersionId);
    try {
      const confirmed = await apiRequest<ParsedCvReview>(`/api/v1/parsed-cvs/${cvVersionId}/confirm`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ expectedRevisionId: review.revisionId })
      });
      setReviews((current) => ({ ...current, [cvVersionId]: confirmed }));
      setCvs((current) => current.map((cv) => cv.activeVersion.cvVersionId === cvVersionId
        ? { ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "CONFIRMED" } }
        : cv));
      setMessage("Parsed CV đã được xác nhận.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setConfirmingVersionId(null);
    }
  }

  return (
    <section className="cv-panel" aria-labelledby="cv-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">CV library</p>
          <h2 id="cv-title">CV của bạn</h2>
        </div>
        <span>{cvs.length} bản CV</span>
      </div>
      <form className="cv-upload-form" onSubmit={upload}>
        <label>
          Tên CV (tuỳ chọn)
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160}
            placeholder="Ví dụ: Backend CV 2026" />
        </label>
        <label>
          File PDF (tối đa 10 MiB)
          <input id="cv-file" type="file" accept="application/pdf,.pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
        </label>
        <button type="submit" disabled={!file || uploading}>
          {uploading ? "Đang tải lên…" : "Tải CV lên"}
        </button>
      </form>
      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {loading ? <p className="muted">Đang tải danh sách CV…</p> : cvs.length === 0 ? (
        <p className="muted">Chưa có CV nào.</p>
      ) : (
        <div className="cv-list">
          {cvs.map((cv) => (
            <article className="cv-item" key={cv.cvId}>
              <div className="cv-item-content">
                <h3>{cv.title}</h3>
                <p>{cv.activeVersion.originalFilename} · {formatBytes(cv.activeVersion.sizeBytes)}</p>
                {(["PARSED", "NEEDS_REVIEW", "CONFIRMED"].includes(cv.activeVersion.processingStatus)) && (
                  <div className="cv-actions">
                    <button type="button" className="secondary-button"
                      onClick={() => void loadReview(cv.activeVersion.cvVersionId)}
                      disabled={reviewingVersionId === cv.activeVersion.cvVersionId}>
                      {reviewingVersionId === cv.activeVersion.cvVersionId ? "Đang tải…" : "Xem bản phân tích"}
                    </button>
                  </div>
                )}
                {reviews[cv.activeVersion.cvVersionId] && (
                  <ParsedCvReviewCard
                    review={reviews[cv.activeVersion.cvVersionId]}
                    confirming={confirmingVersionId === cv.activeVersion.cvVersionId}
                    onConfirm={() => void confirmReview(cv.activeVersion.cvVersionId)}
                  />
                )}
              </div>
              <span className="status-pill">{cv.activeVersion.processingStatus}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ParsedCvReviewCard({ review, confirming, onConfirm }: {
  review: ParsedCvReview;
  confirming: boolean;
  onConfirm: () => void;
}) {
  const summary = review.payload.summary;
  return (
    <div className="parsed-review">
      <p className="parsed-review-title">ParsedCV revision {review.revisionNumber}</p>
      <p>
        Độ tin cậy tổng thể: {summary ? `${Math.round(summary.overallConfidence * 100)}%` : "chưa có"}
        {summary?.qualityFlags.length ? ` · ${summary.qualityFlags.join(", ")}` : ""}
      </p>
      <p>
        {review.payload.skills?.length ?? 0} kỹ năng · {review.payload.experiences?.length ?? 0} kinh nghiệm
      </p>
      {review.status === "CONFIRMED" ? (
        <span className="confirmed-label">Đã xác nhận</span>
      ) : (
        <button type="button" onClick={onConfirm} disabled={confirming}>
          {confirming ? "Đang xác nhận…" : "Xác nhận bản phân tích"}
        </button>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
