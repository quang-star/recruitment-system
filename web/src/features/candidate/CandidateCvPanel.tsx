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
    [key: string]: unknown;
    skills: Array<{ raw: string; canonicalSkillId: string | null; normalizationStatus: "KNOWN" | "PENDING" | "UNRESOLVED"; evidenceIds: string[]; confidence: number; provenance: "EXTRACTED" | "USER_CONFIRMED" | "USER_ASSERTED" }>;
    experiences: Array<{ titleRaw: string; titleCanonical: string | null; companyRedacted: string | null; startMonth: string | null; endMonth: string | null; isCurrent: boolean; responsibilities: string[]; skillIds: string[]; evidenceIds: string[]; confidence: number }>;
    summary: { totalExperienceMonths: number; overallConfidence: number; qualityFlags: string[] };
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
  const [drafts, setDrafts] = useState<Record<string, ParsedCvReview["payload"]>>({});
  const [reviewingVersionId, setReviewingVersionId] = useState<string | null>(null);
  const [confirmingVersionId, setConfirmingVersionId] = useState<string | null>(null);
  const [savingVersionId, setSavingVersionId] = useState<string | null>(null);

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
      setDrafts((current) => ({ ...current, [cvVersionId]: structuredClone(review.payload) }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setReviewingVersionId(null);
    }
  }

  async function saveReview(cvId: string, cvVersionId: string) {
    const review = reviews[cvVersionId];
    const draft = drafts[cvVersionId];
    if (!review || draft === undefined || savingVersionId) return;
    if (draft.skills.some((skill) => !skill.raw.trim())
      || draft.experiences.some((experience) => !experience.titleRaw.trim())) {
      setError("Kỹ năng và chức danh kinh nghiệm không được để trống.");
      return;
    }
    const payload = draft;
    setError(null);
    setSavingVersionId(cvVersionId);
    try {
      const updated = await apiRequest<ParsedCvReview>(`/api/v1/parsed-cvs/${cvVersionId}`, {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({ cvId, expectedRevisionId: review.revisionId, payload })
      });
      setReviews((current) => ({ ...current, [cvVersionId]: updated }));
      setDrafts((current) => ({ ...current, [cvVersionId]: structuredClone(updated.payload) }));
      setCvs((current) => current.map((cv) => cv.activeVersion.cvVersionId === cvVersionId
        ? { ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "PARSED" } }
        : cv));
      setMessage("Đã lưu ParsedCV revision mới. Hãy kiểm tra rồi xác nhận lại.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingVersionId(null);
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
                    saving={savingVersionId === cv.activeVersion.cvVersionId}
                    draft={drafts[cv.activeVersion.cvVersionId] ?? reviews[cv.activeVersion.cvVersionId].payload}
                    onDraftChange={(value) => setDrafts((current) => ({ ...current, [cv.activeVersion.cvVersionId]: value }))}
                    onSave={() => void saveReview(cv.cvId, cv.activeVersion.cvVersionId)}
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

function ParsedCvReviewCard({ review, confirming, saving, draft, onDraftChange, onSave, onConfirm }: {
  review: ParsedCvReview;
  confirming: boolean;
  saving: boolean;
  draft: ParsedCvReview["payload"];
  onDraftChange: (value: ParsedCvReview["payload"]) => void;
  onSave: () => void;
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
      <div className="parsed-section">
        <div className="parsed-section-heading"><strong>Kỹ năng</strong>
          <button type="button" className="secondary-button" onClick={() => onDraftChange({ ...draft,
            skills: [...draft.skills, { raw: "", canonicalSkillId: null, normalizationStatus: "UNRESOLVED", evidenceIds: [], confidence: 1, provenance: "USER_ASSERTED" }]
          })}>Thêm kỹ năng</button>
        </div>
        {draft.skills.map((skill, index) => (
          <div className="parsed-row" key={index}>
            <input aria-label={`Kỹ năng ${index + 1}`} value={skill.raw} maxLength={240}
              onChange={(event) => onDraftChange({ ...draft, skills: draft.skills.map((item, itemIndex) => itemIndex === index ? { ...item, raw: event.target.value } : item) })} />
            <button type="button" className="danger-button" aria-label={`Xóa kỹ năng ${skill.raw || index + 1}`}
              onClick={() => onDraftChange({ ...draft, skills: draft.skills.filter((_, itemIndex) => itemIndex !== index) })}>Xóa</button>
          </div>
        ))}
      </div>
      <div className="parsed-section">
        <div className="parsed-section-heading"><strong>Kinh nghiệm</strong>
          <button type="button" className="secondary-button" onClick={() => onDraftChange({ ...draft,
            experiences: [...draft.experiences, { titleRaw: "", titleCanonical: null, companyRedacted: null, startMonth: null, endMonth: null, isCurrent: false, responsibilities: [], skillIds: [], evidenceIds: [], confidence: 1 }]
          })}>Thêm kinh nghiệm</button>
        </div>
        {draft.experiences.map((experience, index) => (
          <div className="parsed-experience" key={index}>
            <input aria-label={`Chức danh ${index + 1}`} value={experience.titleRaw} maxLength={240} placeholder="Chức danh"
              onChange={(event) => onDraftChange({ ...draft, experiences: draft.experiences.map((item, itemIndex) => itemIndex === index ? { ...item, titleRaw: event.target.value } : item) })} />
            <textarea aria-label={`Trách nhiệm ${index + 1}`} rows={3} value={experience.responsibilities.join("\n")} placeholder="Mỗi trách nhiệm một dòng"
              onChange={(event) => onDraftChange({ ...draft, experiences: draft.experiences.map((item, itemIndex) => itemIndex === index ? { ...item, responsibilities: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) } : item) })} />
            <button type="button" className="danger-button" onClick={() => onDraftChange({ ...draft, experiences: draft.experiences.filter((_, itemIndex) => itemIndex !== index) })}>Xóa kinh nghiệm</button>
          </div>
        ))}
      </div>
      <div className="parsed-section parsed-summary-fields">
        <label>Tổng số tháng kinh nghiệm
          <input type="number" min={0} value={draft.summary.totalExperienceMonths}
            onChange={(event) => onDraftChange({ ...draft, summary: { ...draft.summary, totalExperienceMonths: Math.max(0, Number.parseInt(event.target.value || "0", 10)) } })} />
        </label>
      </div>
      <button type="button" className="secondary-button" onClick={onSave} disabled={saving || review.status === "CONFIRMED"}>
        {saving ? "Đang lưu…" : "Lưu revision mới"}
      </button>
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
