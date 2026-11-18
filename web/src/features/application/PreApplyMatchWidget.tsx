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
  /** Required skills the CV states without source evidence; absent from older AI responses. */
  uncertainSkills?: string[];
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
  onApplyJob: (job: PublicJob, preferredCv?: { cvId: string; cvVersionId?: string }) => void;
  onRequireLogin?: () => void;
  onOpenCvLibrary?: () => void;
  existingApplication?: { applicationId: string; status: string } | null;
  onViewApplication?: (applicationId: string) => void;
};

function previewErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "Không thể kiểm tra độ phù hợp lúc này. Vui lòng thử lại sau.";
  const messages: Record<string, string> = {
    JD_NOT_FOUND: "Tin tuyển dụng này chưa có dữ liệu JD đã xác nhận để đối chiếu. Vui lòng thử lại sau hoặc chọn tin khác.",
    CV_NOT_FOUND: "Không tìm thấy dữ liệu phân tích của CV đã chọn. Vui lòng kiểm tra CV trong thư viện rồi thử lại.",
    CV_NOT_CONFIRMED: "CV đã chọn chưa được xác nhận kết quả phân tích. Vui lòng xác nhận CV trong thư viện rồi thử lại."
  };
  return `${messages[error.error.code] ?? error.error.message} (Mã lỗi: ${error.error.code})`;
}

export const PreApplyMatchWidget: FC<Props> = ({
  job,
  session,
  onApplyJob,
  onRequireLogin,
  onOpenCvLibrary,
  existingApplication,
  onViewApplication,
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
      <section className="rounded-2xl border border-border-subtle bg-slate-50 p-5">
        <p className="text-sm text-ink-600 m-0">
          Vị trí này thuộc nhóm xem xét hồ sơ thủ công, không áp dụng chấm điểm AI tự động.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="pre-match-title"
      className="rounded-2xl border border-brand-200 bg-brand-50/45 p-5 sm:p-6 space-y-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
          <SparklesIcon size={20} aria-hidden="true" />
        </span>
        <div>
          <h3 id="pre-match-title" className="text-base sm:text-lg font-bold text-ink-900 m-0">
            Đánh giá độ phù hợp với CV trước khi nộp
          </h3>
          <p className="text-xs sm:text-sm text-ink-600 m-0 mt-0.5">
            Đối chiếu kỹ năng, kinh nghiệm và nhận lời khuyên từ AI
          </p>
        </div>
      </div>

      {session && loadingCvs && <p className="text-sm text-ink-500 m-0" role="status">Đang tải danh sách CV…</p>}
      {session && cvError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-900 flex flex-wrap items-center justify-between gap-2" role="alert">
          <span>{cvError}</span>
          <button
            type="button"
            onClick={() => setCvLoadVersion((current) => current + 1)}
            className="text-xs font-semibold text-rose-800 underline cursor-pointer bg-transparent border-0 p-0"
          >
            Thử tải lại CV
          </button>
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-900 m-0" role="alert">
          {error}
        </p>
      )}
      {session && !job.jobVersionId && (
        <p className="text-sm text-ink-500 m-0" role="status">Chưa có phiên bản JD được xác nhận để đối chiếu.</p>
      )}

      {!session && (
        <div className="space-y-3 rounded-xl border border-border-subtle bg-white p-4">
          <p className="text-sm text-ink-600 m-0 leading-relaxed">
            Đăng nhập và dùng CV của bạn để AI kiểm tra ngay mức độ phù hợp, chỉ ra kỹ năng đã có và kỹ năng còn thiếu trước khi ứng tuyển.
          </p>
          <button
            type="button"
            onClick={onRequireLogin}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-100 cursor-pointer"
          >
            <SparklesIcon size={16} aria-hidden="true" />
            <span>Đăng nhập để kiểm tra độ phù hợp</span>
          </button>
        </div>
      )}

      {session && !loadingCvs && !cvError && cvs.length === 0 && (
        <div className="space-y-3 rounded-xl border border-border-subtle bg-white p-4">
          <p className="text-sm text-ink-600 m-0 leading-relaxed">
            Bạn chưa có CV nào ở trạng thái <strong>Đã xác nhận</strong>. Hãy tải lên và xác nhận CV để AI có thể đánh giá mức độ phù hợp với vị trí này.
          </p>
          {onOpenCvLibrary && (
            <button
              type="button"
              onClick={onOpenCvLibrary}
              className="inline-flex h-9 items-center rounded-xl border border-border-strong bg-white px-3.5 text-xs font-semibold text-ink-800 hover:bg-slate-50 cursor-pointer"
            >
              Quản lý CV của tôi
            </button>
          )}
        </div>
      )}

      {session && cvs.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-xl border border-border-subtle bg-white p-3">
            <label htmlFor="pre-match-cv-select" className="text-xs font-semibold text-ink-700 shrink-0">
              Chọn CV đối chiếu:
            </label>
            <select
              id="pre-match-cv-select"
              value={selectedCvId}
              onChange={(e) => {
                setSelectedCvId(e.target.value);
                setPreviewResult(null);
                setError(null);
                setShowFullBreakdown(false);
              }}
              disabled={evaluating}
              className="h-9 flex-1 min-w-0 rounded-lg border border-border-strong bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none"
            >
              {cvs.map((cv) => (
                <option key={cv.cvId} value={cv.cvId}>
                  {cv.title}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const target = cvs.find((c) => c.cvId === selectedCvId);
                  if (target) setPreviewingCv(target);
                }}
                disabled={evaluating || loadingCvs || !selectedCvId}
                title="Xem trước tệp PDF CV này"
                className="inline-flex h-9 items-center rounded-lg border border-border-strong bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                👁 Xem CV
              </button>

              <button
                type="button"
                onClick={handleCheckMatch}
                disabled={evaluating || loadingCvs || !selectedCvId || !job.jobVersionId}
                className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 cursor-pointer"
              >
                {evaluating ? "AI đang đối chiếu…" : "⚡ Kiểm tra ngay"}
              </button>
            </div>
          </div>

          {previewResult && (
            <div className="rounded-2xl border border-border-subtle bg-white p-5 shadow-card space-y-4" role="region" aria-label="Kết quả đối chiếu">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
                <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3 shrink-0">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-brand-800 mb-1">
                    Mức độ phù hợp với vị trí
                  </span>
                  <MatchRating match={previewResult} />
                  {previewResult.status === "DEGRADED" && (
                    <small className="block text-xs font-medium text-amber-800 mt-1">
                      Chưa đủ căn cứ chấm điểm · Cần xem thủ công
                    </small>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <small className="block text-xs font-semibold text-ink-500 tabular-nums-kpi">
                    Khớp {previewResult.summary.matchedRequiredSkills}/{previewResult.summary.totalRequiredSkills} kỹ năng cốt lõi
                  </small>
                  <h4 className="text-base font-bold text-ink-900 m-0 leading-snug">
                    {previewResult.status === "INSUFFICIENT_DATA" ? "Chưa đủ dữ liệu để đánh giá độ phù hợp." : previewResult.summary.headline}
                  </h4>
                </div>
              </div>

              <p className="text-xs text-ink-500 m-0">
                Mức độ phù hợp trên thang 1–5 sao chỉ hỗ trợ đối chiếu CV với vị trí, không phải xác suất trúng tuyển.
              </p>

              <div className="flex items-start gap-2.5 rounded-xl border border-border-subtle bg-slate-50 p-3.5 text-sm text-ink-700">
                <SparklesIcon size={18} className="text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="m-0 leading-relaxed">
                  {previewResult.status === "INSUFFICIENT_DATA"
                    ? "Kiểm tra thông tin CV và yêu cầu công việc trước khi đối chiếu lại."
                    : previewResult.summary.advice}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {previewResult.summary.supportedSkills.length > 0 && (
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircleIcon size={14} aria-hidden="true" /> Kỹ năng bạn đã có:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {previewResult.summary.supportedSkills.map((skill) => (
                        <span key={skill} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {previewResult.summary.missingSkills.length > 0 && (
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
                      Kỹ năng nên bổ sung:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {previewResult.summary.missingSkills.map((skill) => (
                        <span key={skill} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(previewResult.summary.uncertainSkills?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                      Kỹ năng cần thêm minh chứng:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {previewResult.summary.uncertainSkills?.map((skill) => (
                        <span key={skill} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-subtle">
                {existingApplication ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-800">
                      Bạn đã ứng tuyển vị trí này
                    </span>
                    {onViewApplication && (
                      <button
                        type="button"
                        onClick={() => onViewApplication(existingApplication.applicationId)}
                        className="inline-flex h-10 items-center rounded-xl border border-border-strong bg-white px-4 text-sm font-semibold text-ink-800 hover:bg-slate-50 cursor-pointer"
                      >
                        Xem đơn ứng tuyển
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onApplyJob(
                        job,
                        selectedCvId
                          ? { cvId: selectedCvId, cvVersionId: previewResult.cvVersionId }
                          : undefined
                      )
                    }
                    className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 cursor-pointer"
                  >
                    Ứng tuyển vị trí này với CV đã chọn
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowFullBreakdown(!showFullBreakdown)}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 cursor-pointer bg-transparent border-0 p-0"
                >
                  {showFullBreakdown ? "Thu gọn chi tiết đối chiếu ▲" : "Xem chi tiết đối chiếu đầy đủ ▼"}
                </button>
              </div>

              {showFullBreakdown && (
                <div className="pt-2">
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
