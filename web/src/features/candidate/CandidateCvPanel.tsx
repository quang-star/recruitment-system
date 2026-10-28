import { DocumentReview } from "../../shared/components/DocumentReview";
import { PdfSource } from "../../shared/components/PdfSource";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { CvPreviewModal } from "../../shared/components/CvPreviewModal";
import { ExternalAiConsent, externalAiPolicyVersion, extractionNeedsManualReview, visibleQualityFlags } from "../../shared/components/ExternalAiConsent";
import { FormEvent, useEffect, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { CvIcon, CheckCircleIcon } from "../../shared/components/Icon";
import { canRetryCv, cvFailureInstruction, cvStatusLabels, pendingCvStatuses, reviewCvStatuses } from "./cvStatus";
import { CvDetails, CvDetailsEditor } from "./CvDetailsEditor";

type CandidateCv = {
  cvId: string;
  version: number;
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
    version: number;
  };
};

type CandidateCvPanelProps = {
  session: AuthSession;
  onFindJobs?: () => void;
};

type ParsedCvReview = {
  revisionId: string;
  cvVersionId: string;
  revisionNumber: number;
  sourceHash: string;
  status: "PARSED" | "CONFIRMED" | "SUPERSEDED";
  payload: CvDetails & {
    [key: string]: unknown;
    skills: Array<{ raw: string; canonicalSkillId: string | null; normalizationStatus: "KNOWN" | "PENDING" | "UNRESOLVED"; evidenceIds: string[]; confidence: number; provenance: "EXTRACTED" | "USER_CONFIRMED" | "USER_ASSERTED" }>;
    experiences: Array<{ titleRaw: string; titleCanonical: string | null; companyRedacted: string | null; startMonth: string | null; endMonth: string | null; isCurrent: boolean; responsibilities: string[]; skillIds: string[]; evidenceIds: string[]; confidence: number }>;
    summary: { totalExperienceMonths: number; overallConfidence: number; qualityFlags: string[] };
  };
};

export function CandidateCvPanel({ session, onFindJobs }: CandidateCvPanelProps) {
  const [focusedVersionId, setFocusedVersionId] = useState<string | null>(null);
  const [cvs, setCvs] = useState<CandidateCv[]>([]);
  const [filter, setFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [externalAiConsent, setExternalAiConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const [reviews, setReviews] = useState<Record<string, ParsedCvReview>>({});
  const [drafts, setDrafts] = useState<Record<string, ParsedCvReview["payload"]>>({});
  const [reviewingVersionId, setReviewingVersionId] = useState<string | null>(null);
  const [confirmingVersionId, setConfirmingVersionId] = useState<string | null>(null);
  const [savingVersionId, setSavingVersionId] = useState<string | null>(null);
  const [retryingCvId, setRetryingCvId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<CandidateCv | null>(null);
  const [previewCvTarget, setPreviewCvTarget] = useState<CandidateCv | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletedCvs = useRef(new Set<string>());
  const deletedVersions = useRef(new Set<string>());

  async function deleteCv(cv: CandidateCv) {
    setDeleting(true); setError(null);
    try {
      await apiRequest(`/api/v2/cvs/${cv.cvId}?version=${cv.version}`, { method: "DELETE", accessToken: session.accessToken });
      deletedCvs.current.add(cv.cvId);
      deletedVersions.current.add(cv.activeVersion.cvVersionId);
      setCvs((current) => current.filter((item) => item.cvId !== cv.cvId));
      setReviews((current) => { const next = { ...current }; delete next[cv.activeVersion.cvVersionId]; return next; });
      setDrafts((current) => { const next = { ...current }; delete next[cv.activeVersion.cvVersionId]; return next; });
      setDeleteTarget(null);
      setMessage("CV đã bị thu hồi quyền truy cập. Hệ thống đang xóa tệp và dữ liệu phân tích; lịch sử ứng tuyển được giữ lại.");
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setDeleting(false); }
  }

  async function loadCvs() {
    try {
      const result = await apiRequest<CandidateCv[]>("/api/v2/cvs", { accessToken: session.accessToken });
      setCvs((current) => result.filter((cv) => !deletedCvs.current.has(cv.cvId)).map((incoming) => {
        const local = current.find((cv) => cv.cvId === incoming.cvId);
        return local && local.activeVersion.cvVersionId === incoming.activeVersion.cvVersionId
          && local.activeVersion.version > incoming.activeVersion.version ? local : incoming;
      }));
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

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (uploading) return;
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const droppedFile = droppedFiles[0];
      if (droppedFile.type === "application/pdf" || droppedFile.name.toLowerCase().endsWith(".pdf")) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError("Chỉ chấp nhận tệp có định dạng PDF.");
      }
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) return;
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
      setError("Vui lòng chọn tệp PDF."); return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Tệp PDF phải có nội dung và không vượt quá 10 MiB."); return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    body.append("externalAiConsent", String(externalAiConsent));
    if (externalAiConsent) body.append("externalAiPolicyVersion", externalAiPolicyVersion);
    if (title.trim()) body.append("title", title.trim());

    try {
      const created = await apiRequest<CandidateCv>("/api/v2/cvs", {
        method: "POST",
        accessToken: session.accessToken,
        body
      });
      setCvs((current) => [created, ...current]);
      setFile(null);
      setExternalAiConsent(false);
      setTitle("");
      const input = document.getElementById("cv-file") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage("CV đã được lưu an toàn. Kết quả phân tích sẽ hiển thị trong danh sách bên dưới.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setUploading(false);
    }
  }

  async function retryCv(cv: CandidateCv) {
    if (retryingCvId || !canRetryCv(cv.activeVersion.processingStatus, cv.activeVersion.failureCode)) return;
    setRetryingCvId(cv.cvId);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiRequest<CandidateCv>(`/api/v2/cvs/${cv.cvId}/retry`, {
        method: "POST", accessToken: session.accessToken,
        body: JSON.stringify({ cvVersionId: cv.activeVersion.cvVersionId, expectedVersion: cv.activeVersion.version }),
      });
      setCvs((current) => current.map((item) => item.cvId === updated.cvId
        && item.activeVersion.version <= updated.activeVersion.version ? updated : item));
      setMessage("Đã yêu cầu phân tích lại CV. Trạng thái sẽ tự cập nhật.");
    } catch (requestError) {
      setError(requestError instanceof ApiClientError && requestError.error.code === "CV_RETRY_CONFLICT"
        ? "Trạng thái CV đã thay đổi. Hãy xem kết quả mới nhất trước khi thử lại."
        : getErrorMessage(requestError));
      await loadCvs();
    } finally {
      setRetryingCvId(null);
    }
  }

  async function loadReview(cvVersionId: string) {
    setError(null);
    setReviewingVersionId(cvVersionId);
    try {
      const review = await apiRequest<ParsedCvReview>(`/api/v2/parsed-cvs/${cvVersionId}`, {
        accessToken: session.accessToken
      });
      if (deletedVersions.current.has(cvVersionId)) return;
      setReviews((current) => ({ ...current, [cvVersionId]: review }));
      setDrafts((current) => ({ ...current, [cvVersionId]: structuredClone(review.payload) }));
      setFocusedVersionId(cvVersionId);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setReviewingVersionId(null);
    }
  }

  async function saveReview(cvId: string, cvVersionId: string) {
    const review = reviews[cvVersionId];
    const draft = drafts[cvVersionId];
    if (!review || draft === undefined || savingVersionId || confirmingVersionId || review.status === "CONFIRMED") return;
    if (draft.skills.some((skill) => !skill.raw.trim())
      || draft.experiences.some((experience) => !experience.titleRaw.trim())) {
      setError("Kỹ năng và chức danh kinh nghiệm không được để trống.");
      return;
    }
    const payload = draft;
    setError(null);
    setSavingVersionId(cvVersionId);
    try {
      const updated = await apiRequest<ParsedCvReview>(`/api/v2/parsed-cvs/${cvVersionId}`, {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({ cvId, expectedRevisionId: review.revisionId, payload })
      });
      if (deletedVersions.current.has(cvVersionId)) return;
      setReviews((current) => ({ ...current, [cvVersionId]: updated }));
      setDrafts((current) => ({ ...current, [cvVersionId]: structuredClone(updated.payload) }));
      setCvs((current) => current.map((cv) => cv.activeVersion.cvVersionId === cvVersionId
        ? { ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "PARSED" } }
        : cv));
      setMessage("Đã lưu thay đổi. Bạn có thể xác nhận thông tin để dùng CV ứng tuyển.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingVersionId(null);
    }
  }

  async function confirmReview(cvVersionId: string) {
    const review = reviews[cvVersionId];
    if (!review || confirmingVersionId || savingVersionId || JSON.stringify(drafts[cvVersionId]) !== JSON.stringify(review.payload)) return;
    setError(null);
    setConfirmingVersionId(cvVersionId);
    try {
      const confirmed = await apiRequest<ParsedCvReview>(`/api/v2/parsed-cvs/${cvVersionId}/confirm`, {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ expectedRevisionId: review.revisionId })
      });
      if (deletedVersions.current.has(cvVersionId)) return;
      setReviews((current) => ({ ...current, [cvVersionId]: confirmed }));
      setDrafts((current) => ({ ...current, [cvVersionId]: structuredClone(confirmed.payload) }));
      setCvs((current) => current.map((cv) => cv.activeVersion.cvVersionId === cvVersionId
        ? { ...cv, activeVersion: { ...cv.activeVersion, processingStatus: "CONFIRMED" } }
        : cv));
      setMessage("CV đã được xác nhận và sẵn sàng ứng tuyển.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setConfirmingVersionId(null);
    }
  }

  const activeCvs = cvs.filter((cv) => cv.status === "ACTIVE");
  const readyCount = activeCvs.filter((cv) => cv.activeVersion.processingStatus === "CONFIRMED").length;
  const reviewCount = activeCvs.filter((cv) => reviewCvStatuses.includes(cv.activeVersion.processingStatus)).length;
  const visibleCvs = activeCvs.filter((cv) => filter === "all" || (filter === "ready"
    ? cv.activeVersion.processingStatus === "CONFIRMED" : reviewCvStatuses.includes(cv.activeVersion.processingStatus)));

  const focusedCv = activeCvs.find((cv) => cv.activeVersion.cvVersionId === focusedVersionId);
  const focusedReview = focusedVersionId ? reviews[focusedVersionId] : null;
  const reviewDirty = !!focusedVersionId && !!focusedReview && JSON.stringify(drafts[focusedVersionId]) !== JSON.stringify(focusedReview.payload);
  useUnsavedChanges(reviewDirty, () => setError("Bạn còn thay đổi chưa lưu. Hãy lưu trước khi rời bản phân tích."));
  function closeReview() {
    if (reviewDirty || savingVersionId || confirmingVersionId) {
      setError("Bạn còn thay đổi chưa lưu hoặc đang xử lý. Hãy lưu trước khi đóng bản phân tích."); return;
    }
    setFocusedVersionId(null); setError(null); setMessage(null);
  }
  if (focusedCv && focusedReview && focusedVersionId) return <section className="cv-panel focused-cv-review">
    <div className="section-heading"><div><p className="eyebrow">ĐỐI SOÁT HỒ SƠ</p><h2>{focusedCv.title}</h2><small>Bản CV {focusedCv.activeVersion.versionNumber} · {focusedCv.activeVersion.originalFilename}</small></div>
      <button type="button" className="secondary-button" onClick={closeReview}>Đóng bản phân tích</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p className="success-message" role="status">{message}</p>}
    <DocumentReview title="Tệp CV gốc" source={<PdfSource filename={focusedCv.activeVersion.originalFilename}
      path={`/api/v2/cvs/${focusedCv.cvId}/file?cvVersionId=${encodeURIComponent(focusedVersionId)}`} accessToken={session.accessToken} />}>
      <ParsedCvReviewCard review={focusedReview} confirming={confirmingVersionId === focusedVersionId} saving={savingVersionId === focusedVersionId}
        draft={drafts[focusedVersionId] ?? focusedReview.payload}
        onDraftChange={(value) => setDrafts((current) => ({ ...current, [focusedVersionId]: value }))}
        onSave={() => void saveReview(focusedCv.cvId, focusedVersionId)} onConfirm={() => void confirmReview(focusedVersionId)} />
    </DocumentReview>
  </section>;

  return (
    <section className="cv-panel candidate-cv-library" aria-labelledby="cv-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">HỒ SƠ NGHỀ NGHIỆP</p>
          <h2 id="cv-title">CV của tôi</h2><p className="muted">Chuẩn bị hồ sơ chính xác trước khi gửi đến nhà tuyển dụng.</p>
        </div>
        <span className="candidate-state confirmed">{readyCount} CV sẵn sàng</span>
      </div>
      <ol className="cv-workflow" aria-label="Các bước chuẩn bị CV">
        <li><span>01</span><div><strong>Tải CV lên</strong><small>Chọn tệp PDF của bạn</small></div></li>
        <li><span>02</span><div><strong>Kiểm tra thông tin</strong><small>Đọc và sửa kết quả AI</small></div></li>
        <li><span>03</span><div><strong>Xác nhận & ứng tuyển</strong><small>Bạn quyết định thông tin sử dụng</small></div></li>
      </ol>
      <div className="cv-upload-intro"><CvIcon size={25} aria-hidden="true" /><div><h3>Thêm CV mới</h3><p>PDF tối đa 10 MiB. Sau khi phân tích, hãy kiểm tra lại thông tin trước khi xác nhận.</p></div></div>
      <form className="cv-upload-form" aria-label="Tải CV mới" onSubmit={upload}>
        <div className="cv-upload-fields">
          <label className="cv-title-field">
            <span>Tên CV (tuỳ chọn)</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              placeholder="Ví dụ: Backend CV 2026"
            />
          </label>

          <div className="cv-file-field-group">
            <label htmlFor="cv-file" className="cv-file-label">
              File PDF (tối đa 10 MiB)
            </label>
            <div
              className={`cv-dropzone-box ${isDragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                document.getElementById("cv-file")?.click();
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  document.getElementById("cv-file")?.click();
                }
              }}
            >
              <input
                id="cv-file"
                type="file"
                accept="application/pdf,.pdf"
                className="cv-file-hidden-input"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
                disabled={uploading}
                required={!file}
              />
              <div className="cv-dropzone-inner">
                {file ? (
                  <div className="cv-selected-file">
                    <div className="cv-file-icon">
                      <CvIcon size={32} aria-hidden="true" />
                    </div>
                    <div className="cv-file-meta">
                      <strong className="cv-file-name">{file.name}</strong>
                      <span className="cv-file-size">{formatBytes(file.size)}</span>
                    </div>
                    <button
                      type="button"
                      className="cv-change-file-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFile(null);
                        const input = document.getElementById("cv-file") as HTMLInputElement | null;
                        if (input) input.value = "";
                      }}
                    >
                      Đổi tệp khác
                    </button>
                  </div>
                ) : (
                  <div className="cv-dropzone-prompt">
                    <div className="cv-dropzone-icon">
                      <CvIcon size={32} aria-hidden="true" />
                    </div>
                    <div className="cv-dropzone-text">
                      <strong>Kéo và thả tệp CV (PDF) vào đây</strong>
                      <span>hoặc <span className="cv-browse-link">chọn tệp từ máy tính</span></span>
                    </div>
                    <span className="cv-dropzone-hint">Định dạng hỗ trợ: PDF (tối đa 10 MiB)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <ExternalAiConsent checked={externalAiConsent} disabled={uploading} onChange={setExternalAiConsent} />

        <div className="cv-upload-action-row">
          <button type="submit" className="cv-submit-upload-btn" disabled={!file || uploading}>
            {uploading ? "Đang tải lên…" : "Tải CV lên"}
          </button>
        </div>
      </form>
      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="cv-library-toolbar"><div role="group" aria-label="Lọc danh sách CV">{[
        ["all", `Tất cả (${activeCvs.length})`], ["review", `Cần kiểm tra (${reviewCount})`], ["ready", `Sẵn sàng (${readyCount})`]
      ].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><button type="button" className="secondary-button" onClick={() => void loadCvs()}>Làm mới</button></div>
      {loading ? <p className="muted" role="status">Đang tải danh sách CV…</p> : visibleCvs.length === 0 ? (
        <div className="candidate-empty"><CvIcon size={32} aria-hidden="true" /><h3>{activeCvs.length === 0 ? "Thêm CV đầu tiên của bạn" : "Không có CV trong nhóm này"}</h3><p>{activeCvs.length === 0 ? "Tải tệp PDF ở phía trên để bắt đầu. AI sẽ hỗ trợ điền thông tin, bạn kiểm tra và xác nhận." : "Chọn nhóm khác để xem các CV còn lại."}</p></div>
      ) : (
        <div className="cv-list">
          {visibleCvs.map((cv) => (
            <article className="cv-item" key={cv.cvId}>
              <div className="cv-item-content">
                <div className="cv-item-heading"><h3>{cv.title}</h3><span className={`candidate-state ${cv.activeVersion.processingStatus.toLowerCase()}`}>{cvStatusLabels[cv.activeVersion.processingStatus] ?? cv.activeVersion.processingStatus}</span></div>
                <button type="button" className="danger-button" disabled={deleting}
                  onClick={() => setDeleteTarget(cv)}>Xóa CV</button>
                <p>{cv.activeVersion.originalFilename} · {formatBytes(cv.activeVersion.sizeBytes)}</p>
                <p className="cv-next-instruction">{pendingCvStatuses.includes(cv.activeVersion.processingStatus)
                  ? "AI đang xử lý tệp. Trạng thái sẽ tự cập nhật, bạn chưa cần thao tác."
                  : reviewCvStatuses.includes(cv.activeVersion.processingStatus) ? "Mở bản phân tích để kiểm tra, chỉnh sửa và xác nhận thông tin."
                  : cv.activeVersion.processingStatus === "CONFIRMED" ? "CV này đã có thể sử dụng khi ứng tuyển."
                  : cv.activeVersion.processingStatus === "FAILED" ? cvFailureInstruction(cv.activeVersion.failureCode)
                  : "Hãy kiểm tra tệp PDF và tải một bản mới nếu cần."}</p>
                {cv.status === "ACTIVE" && canRetryCv(cv.activeVersion.processingStatus, cv.activeVersion.failureCode) && (
                  <button type="button" className="secondary-button" disabled={retryingCvId !== null}
                    onClick={() => void retryCv(cv)}>
                    {retryingCvId === cv.cvId ? "Đang gửi yêu cầu…" : "Thử lại"}
                  </button>
                )}
                {cv.activeVersion.processingStatus === "CONFIRMED" && onFindJobs && <button type="button" className="cv-find-jobs" onClick={onFindJobs}><CheckCircleIcon size={16} aria-hidden="true" /> Tìm việc để ứng tuyển →</button>}
                {(["PARSED", "NEEDS_REVIEW", "CONFIRMED"].includes(cv.activeVersion.processingStatus)) && (
                  <div className="cv-actions">
                    <button type="button" className="secondary-button"
                      onClick={() => setPreviewCvTarget(cv)}>
                      Xem tệp gốc (PDF)
                    </button>
                    <button type="button" className="secondary-button"
                      onClick={() => {
                        const id = cv.activeVersion.cvVersionId;
                        if (reviews[id]) setFocusedVersionId(id);
                        else void loadReview(id);
                      }}
                      disabled={reviewingVersionId === cv.activeVersion.cvVersionId}>
                      {reviewingVersionId === cv.activeVersion.cvVersionId ? "Đang tải…" : "Xem bản phân tích"}
                    </button>
                  </div>
                )}
              </div>

            </article>
          ))}
        </div>
      )}
      <ConfirmDialog open={deleteTarget !== null} title="Xóa CV" confirmLabel="Xác nhận xóa CV" busy={deleting}
        description="Xóa tệp và dữ liệu phân tích của CV này, thu hồi quyền xem CV và điểm của các hồ sơ đã nộp. Lịch sử ứng tuyển tối thiểu được giữ lại. Thao tác không thể hoàn tác."
        onCancel={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) void deleteCv(deleteTarget); }} />
      {previewCvTarget && (
        <CvPreviewModal
          open={previewCvTarget !== null}
          onClose={() => setPreviewCvTarget(null)}
          title={`CV: ${previewCvTarget.title}`}
          filename={previewCvTarget.activeVersion.originalFilename}
          downloadPath={`/api/v2/cvs/${previewCvTarget.cvId}/file?cvVersionId=${encodeURIComponent(previewCvTarget.activeVersion.cvVersionId)}`}
          accessToken={session.accessToken}
        />
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
  const qualityFlags = visibleQualityFlags(summary?.qualityFlags ?? []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(review.payload);
  const locked = saving || confirming || review.status === "CONFIRMED";
  return (
    <div className="parsed-review">
      <p className="parsed-review-title">Kiểm tra thông tin CV · Bản {review.revisionNumber}</p><p className="muted">AI có thể đọc chưa chính xác. Hãy kiểm tra các mục dưới đây trước khi xác nhận.</p>
      <details className="extraction-details"><summary>Chi tiết phân tích tự động</summary><p>
        Độ tin cậy trích xuất: {summary ? `${Math.round(summary.overallConfidence * 100)}%` : "chưa có"}
        {qualityFlags.length ? ` · ${qualityFlags.join(", ")}` : ""}
      </p>
      </details>
      <p>
        {review.payload.skills?.length ?? 0} kỹ năng · {review.payload.experiences?.length ?? 0} kinh nghiệm
      </p>
      {summary && extractionNeedsManualReview(summary.qualityFlags) && <p className="muted" role="status">
        Phân tích tự động chưa đầy đủ, vui lòng kiểm tra và bổ sung.
      </p>}
      <fieldset className="cv-review-fields" disabled={locked}><legend className="sr-only">Thông tin được trích xuất từ CV</legend>
      <div className="parsed-section">
        <div className="parsed-section-heading"><strong>Kỹ năng</strong>
          <button type="button" className="secondary-button" onClick={() => onDraftChange({ ...draft,
            skills: [...draft.skills, { raw: "", canonicalSkillId: null, normalizationStatus: "UNRESOLVED", evidenceIds: [], confidence: 1, provenance: "USER_ASSERTED" }]
          })}>Thêm kỹ năng</button>
        </div>
        {draft.skills.map((skill, index) => (
          <div key={index}>
          <div className="parsed-row">
            <input aria-label={`Kỹ năng ${index + 1}`} value={skill.raw} maxLength={240}
              onChange={(event) => onDraftChange({ ...draft, skills: draft.skills.map((item, itemIndex) => itemIndex === index ? { ...item, raw: event.target.value } : item) })} />
            <button type="button" className="danger-button" aria-label={`Xóa kỹ năng ${skill.raw || index + 1}`}
              onClick={() => onDraftChange({ ...draft, skills: draft.skills.filter((_, itemIndex) => itemIndex !== index) })}>Xóa</button>
          </div>
          {skill.normalizationStatus !== "KNOWN" && <small className="muted">Chưa vào danh mục chung · có thể đối chiếu tên chính xác với yêu cầu Job đã xác nhận khi có bằng chứng CV.</small>}
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
            <label>Bắt đầu công việc {index + 1}<input type="month" value={experience.startMonth ?? ""}
              onChange={(event) => onDraftChange({ ...draft, experiences: draft.experiences.map((item, i) => i === index ? { ...item, startMonth: event.target.value || null } : item) })} /></label>
            <label>Đang làm việc {index + 1}<input type="checkbox" checked={experience.isCurrent}
              onChange={(event) => onDraftChange({ ...draft, experiences: draft.experiences.map((item, i) => i === index ? { ...item, isCurrent: event.target.checked, endMonth: event.target.checked ? null : item.endMonth } : item) })} /></label>
            <label>Kết thúc công việc {index + 1}<input type="month" disabled={experience.isCurrent} min={experience.startMonth ?? undefined} value={experience.endMonth ?? ""}
              onChange={(event) => onDraftChange({ ...draft, experiences: draft.experiences.map((item, i) => i === index ? { ...item, endMonth: event.target.value || null } : item) })} /></label>
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
      <CvDetailsEditor value={draft} onChange={(patch) => onDraftChange({ ...draft, ...patch })} />
      </fieldset>
      <div className="cv-review-footer">
      {dirty && <p role="status">Bạn có thay đổi chưa lưu. Lưu thay đổi trước khi xác nhận.</p>}
      <button type="button" className="secondary-button" onClick={onSave} disabled={locked || !dirty}>
        {saving ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
      {review.status === "CONFIRMED" ? (
        <span className="confirmed-label">Đã xác nhận</span>
      ) : (
        <button type="button" onClick={onConfirm} disabled={confirming || saving || dirty}>
          {confirming ? "Đang xác nhận…" : "Xác nhận bản phân tích"}
        </button>
      )}
      </div>
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
