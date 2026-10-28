import { FC, useEffect, useRef, useState } from "react";
import { PublicJob } from "../public/types";
import { AuthSession } from "../../shared/auth/session";
import { apiRequest, ApiClientError } from "../../shared/api/client";
import { SparklesIcon, CheckCircleIcon } from "../../shared/components/Icon";
import { ApplicationMatch, MatchBreakdown } from "./MatchBreakdown";
import { MatchRating } from "./MatchRating";
import { CvPreviewModal } from "../../shared/components/CvPreviewModal";

type CvItem = {
  cvId: string;
  title: string;
  activeVersion: {
    cvVersionId: string;
    processingStatus: string;
    originalFilename?: string;
  };
};

export type MatchPreviewSummary = {
  matchLevel: "EXCELLENT" | "GOOD" | "POTENTIAL" | "NEEDS_DEVELOPMENT";
  headline: string;
  advice: string;
  supportedSkills: string[];
  missingSkills: string[];
  totalRequiredSkills: number;
  matchedRequiredSkills: number;
};

export type MatchPreviewResponse = ApplicationMatch & {
  cvVersionId: string;
  jobVersionId: string;
  summary: MatchPreviewSummary;
};

type Props = {
  job: PublicJob;
  session?: AuthSession | null;
  onApplyJob: (job: PublicJob) => void;
  onRequireLogin?: () => void;
  onOpenCvLibrary?: () => void;
};

function previewErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "Không thể kiểm tra độ phù hợp lúc này. Vui lòng thử lại sau.";
  const messages: Record<string, string> = {
    JD_NOT_FOUND: "Tin tuyển dụng này chưa có dữ liệu JD đã xác nhận để đối chiếu. Vui lòng thử lại sau hoặc chọn tin khác.",
    CV_NOT_FOUND: "Không tìm thấy dữ liệu phân tích của CV đã chọn. Vui lòng kiểm tra CV trong thư viện rồi thử lại."
  };
  return `${messages[error.error.code] ?? error.error.message} (Mã lỗi: ${error.error.code})`;
}

export const PreApplyMatchWidget: FC<Props> = ({
  job,
  session,
  onApplyJob,
  onRequireLogin,
  onOpenCvLibrary,
}) => {
  const [cvs, setCvs] = useState<CvItem[]>([]);
  const [selectedCvId, setSelectedCvId] = useState<string>("");
  const [loadingCvs, setLoadingCvs] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [previewResult, setPreviewResult] = useState<MatchPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvLoadVersion, setCvLoadVersion] = useState(0);
  const [showFullBreakdown, setShowFullBreakdown] = useState(false);
  const [previewingCv, setPreviewingCv] = useState<CvItem | null>(null);
  const previewRequest = useRef<AbortController | null>(null);

  // Load user's confirmed CVs when logged in
  useEffect(() => {
    if (!session?.accessToken || job.matchingSupported === false) {
      setCvs([]);
      setSelectedCvId("");
      setLoadingCvs(false);
      setCvError(null);
      return;
    }
    const controller = new AbortController();
    setCvs([]);
    setLoadingCvs(true);
    setCvError(null);
    apiRequest<CvItem[]>("/api/v2/cvs", { accessToken: session.accessToken, signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        const confirmed = items.filter(
          (c) => c.activeVersion?.processingStatus === "CONFIRMED"
        );
        setCvs(confirmed);
        setSelectedCvId((current) => confirmed.some((cv) => cv.cvId === current) ? current : confirmed[0]?.cvId ?? "");
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setCvError(
            err instanceof ApiClientError ? err.error.message : "Chưa tải được danh sách CV"
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCvs(false);
      });
    return () => controller.abort();
  }, [session?.accessToken, session?.userId, job.matchingSupported, cvLoadVersion]);

  // Reset match preview when job changes
  useEffect(() => {
    previewRequest.current?.abort();
    previewRequest.current = null;
    setPreviewResult(null);
    setError(null);
    setShowFullBreakdown(false);
    setEvaluating(false);
    setPreviewingCv(null);
    return () => { previewRequest.current?.abort(); };
  }, [job.jobId, job.jobVersionId, job.matchingSupported, session?.userId]);

  async function handleCheckMatch() {
    if (!session?.accessToken) {
      onRequireLogin?.();
      return;
    }
    const targetCv = cvs.find((c) => c.cvId === selectedCvId);
    if (!targetCv?.activeVersion?.cvVersionId) {
      setError("Vui lòng chọn một CV đã xác nhận.");
      return;
    }
    if (!job.jobVersionId) {
      setError("Chưa có phiên bản JD được xác nhận để đối chiếu.");
      return;
    }

    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setEvaluating(true);
    setError(null);
    setPreviewResult(null);
    try {
      const response = await apiRequest<MatchPreviewResponse>(
        "/api/v2/matching-requests/preview",
        {
          method: "POST",
          accessToken: session.accessToken,
          signal: controller.signal,
          body: JSON.stringify({
            cvVersionId: targetCv.activeVersion.cvVersionId,
            jobVersionId: job.jobVersionId,
          }),
        }
      );
      if (!controller.signal.aborted && previewRequest.current === controller) setPreviewResult(response);
    } catch (err) {
      if (controller.signal.aborted || previewRequest.current !== controller) return;
      setError(previewErrorMessage(err));
    } finally {
      if (previewRequest.current === controller) {
        previewRequest.current = null;
        setEvaluating(false);
      }
    }
  }

  if (job.matchingSupported === false) {
    return (
      <section className="jd-section-block ai-feature-block non-it-notice">
        <p className="muted">
          Vị trí này thuộc nhóm xem xét hồ sơ thủ công, không áp dụng chấm điểm AI tự động.
        </p>
      </section>
    );
  }

  return (
    <section className="jd-section-block ai-feature-block pre-apply-match-card" aria-labelledby="pre-match-title">
      <div className="ai-block-header">
        <SparklesIcon size={24} aria-hidden="true" />
        <div>
          <h3 id="pre-match-title" className="ai-block-title">
            Đánh giá độ phù hợp với CV trước khi nộp
          </h3>
          <small>Đối chiếu kỹ năng, kinh nghiệm và nhận lời khuyên từ AI</small>
        </div>
      </div>

      {session && loadingCvs && <p className="muted" role="status">Đang tải danh sách CV…</p>}
      {session && cvError && <p className="error-message" role="alert">{cvError} <button type="button" className="text-button" onClick={() => setCvLoadVersion((current) => current + 1)}>Thử tải lại CV</button></p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {session && !job.jobVersionId && <p className="muted" role="status">Chưa có phiên bản JD được xác nhận để đối chiếu.</p>}

      {/* Guest Mode: Not Logged In */}
      {!session && (
        <div className="pre-match-guest-prompt">
          <p className="ai-block-desc">
            Đăng nhập và dùng CV của bạn để AI kiểm tra ngay mức độ phù hợp, chỉ ra kỹ năng đã có và kỹ năng còn thiếu trước khi ứng tuyển.
          </p>
          <button
            type="button"
            className="secondary-button pre-match-cta-btn"
            onClick={onRequireLogin}
          >
            <SparklesIcon size={16} aria-hidden="true" /> Đăng nhập để kiểm tra độ phù hợp
          </button>
        </div>
      )}

      {/* Candidate Mode: Logged in but has no confirmed CV */}
      {session && !loadingCvs && !cvError && cvs.length === 0 && (
        <div className="pre-match-no-cv-prompt">
          <p className="ai-block-desc">
            Bạn chưa có CV nào ở trạng thái <strong>Đã xác nhận</strong>. Hãy tải lên và xác nhận CV để AI có thể đánh giá mức độ phù hợp với vị trí này.
          </p>
          {onOpenCvLibrary && (
            <button
              type="button"
              className="secondary-button pre-match-cta-btn"
              onClick={onOpenCvLibrary}
            >
              Quản lý CV của tôi
            </button>
          )}
        </div>
      )}

      {/* Candidate Mode: Has confirmed CVs */}
      {session && cvs.length > 0 && (
        <div className="pre-match-active-panel">
          <div className="pre-match-cv-selector-row">
            <label htmlFor="pre-match-cv-select" className="pre-match-label">
              Chọn CV đối chiếu:
            </label>
            <select
              id="pre-match-cv-select"
              className="pre-match-select"
              value={selectedCvId}
              onChange={(e) => {
                setSelectedCvId(e.target.value);
                setPreviewResult(null);
                setError(null);
                setShowFullBreakdown(false);
              }}
              disabled={evaluating}
            >
              {cvs.map((cv) => (
                <option key={cv.cvId} value={cv.cvId}>
                  {cv.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="secondary-button compact-btn pre-match-preview-cv-btn"
              onClick={() => {
                const target = cvs.find((c) => c.cvId === selectedCvId);
                if (target) setPreviewingCv(target);
              }}
              disabled={evaluating || loadingCvs || !selectedCvId}
              title="Xem trước tệp PDF CV này"
            >
              👁 Xem CV
            </button>

            <button
              type="button"
              className="primary-button pre-match-run-btn"
              onClick={handleCheckMatch}
              disabled={evaluating || loadingCvs || !selectedCvId || !job.jobVersionId}
            >
              {evaluating ? "AI đang đối chiếu…" : "⚡ Kiểm tra ngay"}
            </button>
          </div>

          {/* Results Display */}
          {previewResult && (
            <div className="pre-match-result-card" role="region" aria-label="Kết quả đối chiếu">
              <div className="pre-match-score-row">
                <div className="pre-match-rating">
                  <span className="pre-match-rating-heading">Mức độ phù hợp với vị trí</span>
                  <MatchRating match={previewResult} />
                  {previewResult.status === "DEGRADED" && <small className="match-rating-quality">Cần kiểm tra thêm</small>}
                </div>
                <div className="pre-match-meta">
                  <div className="pre-match-badge-wrap">
                    <small className="muted">
                      Khớp {previewResult.summary.matchedRequiredSkills}/
                      {previewResult.summary.totalRequiredSkills} kỹ năng cốt lõi
                    </small>
                  </div>
                  <h4 className="pre-match-headline">{previewResult.status === "INSUFFICIENT_DATA" ? "Chưa đủ dữ liệu để đánh giá độ phù hợp." : previewResult.summary.headline}</h4>
                </div>
              </div>

              <p className="muted match-score-disclaimer">Mức độ phù hợp trên thang 1–5 sao chỉ hỗ trợ đối chiếu CV với vị trí, không phải xác suất trúng tuyển.</p>

              {/* Actionable Advice Card */}
              <div className="pre-match-advice-box">
                <SparklesIcon size={18} aria-hidden="true" />
                <p>{previewResult.status === "INSUFFICIENT_DATA" ? "Kiểm tra thông tin CV và yêu cầu công việc trước khi đối chiếu lại." : previewResult.summary.advice}</p>
              </div>

              {/* Skills breakdown chips */}
              <div className="pre-match-skills-breakdown">
                {previewResult.summary.supportedSkills.length > 0 && (
                  <div className="pre-match-chip-group">
                    <span className="chip-group-label supported-label">
                      <CheckCircleIcon size={14} aria-hidden="true" /> Kỹ năng bạn đã có:
                    </span>
                    <div className="pre-match-chips">
                      {previewResult.summary.supportedSkills.map((skill) => (
                        <span key={skill} className="pre-match-chip chip-supported">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {previewResult.summary.missingSkills.length > 0 && (
                  <div className="pre-match-chip-group">
                    <span className="chip-group-label missing-label">
                      ⚠️ Kỹ năng nên bổ sung:
                    </span>
                    <div className="pre-match-chips">
                      {previewResult.summary.missingSkills.map((skill) => (
                        <span key={skill} className="pre-match-chip chip-missing">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="pre-match-actions-row">
                <button
                  type="button"
                  className="jd-big-apply-btn pre-match-apply-btn"
                  onClick={() => onApplyJob(job)}
                >
                  Ứng tuyển vị trí này với CV đã chọn
                </button>
                <button
                  type="button"
                  className="text-button pre-match-details-toggle"
                  onClick={() => setShowFullBreakdown(!showFullBreakdown)}
                >
                  {showFullBreakdown
                    ? "Thu gọn chi tiết đối chiếu ▲"
                    : "Xem chi tiết đối chiếu đầy đủ ▼"}
                </button>
              </div>

              {/* Full breakdown if user wants to see all components and evidence */}
              {showFullBreakdown && (
                <div className="pre-match-full-breakdown-wrap">
                  <MatchBreakdown match={previewResult} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {previewingCv && (
        <CvPreviewModal
          open={previewingCv !== null}
          onClose={() => setPreviewingCv(null)}
          title={`Xem trước: ${previewingCv.title}`}
          filename={previewingCv.activeVersion?.originalFilename}
          downloadPath={`/api/v2/cvs/${previewingCv.cvId}/file?cvVersionId=${encodeURIComponent(previewingCv.activeVersion.cvVersionId)}`}
          accessToken={session?.accessToken ?? ""}
        />
      )}
    </section>
  );
};
