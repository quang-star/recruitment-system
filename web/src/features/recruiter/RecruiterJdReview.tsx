import { DocumentReview } from "../../shared/components/DocumentReview";
import { extractionNeedsManualReview, visibleQualityFlags } from "../../shared/components/ExternalAiConsent";
import { CheckCircleIcon, SparklesIcon } from "../../shared/components/Icon";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";
import { Job, ParsedJd } from "./recruiterJobTypes";

type Props = {
  selectedRecord: Job;
  parsedJd: ParsedJd | null;
  parsedJdDraft: ParsedJd["payload"] | null;
  loadingParsedJd: boolean;
  reviewDirty: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
  onAddSkill: (section: "requiredSkills" | "preferredSkills") => void;
  onUpdateSkill: (section: "requiredSkills" | "preferredSkills", index: number, raw: string) => void;
  onRemoveSkill: (section: "requiredSkills" | "preferredSkills", index: number) => void;
  onUpdateExperienceMonths: (months: number | null) => void;
  onSaveParsedJd: () => void;
  onConfirmParsedJd: () => void;
};

export function RecruiterJdReview({
  selectedRecord,
  parsedJd,
  parsedJdDraft,
  loadingParsedJd,
  reviewDirty,
  saving,
  message,
  error,
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
  onUpdateExperienceMonths,
  onSaveParsedJd,
  onConfirmParsedJd
}: Props) {
  return (
    <Card padding="lg" className="space-y-4">
      {error && <ErrorBanner tone="error" message={error} />}
      {message && <ErrorBanner tone="success" message={message} />}

      <DocumentReview
        title="Nội dung JD gốc đã lưu"
        source={
          <Card padding="md" className="bg-slate-50/80 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 m-0">
                NỘI DUNG GỐC ĐÃ LƯU · BẢN {selectedRecord.jobVersionNumber}
              </p>
              <h3 className="text-base font-bold text-ink-900 m-0 mt-1">{selectedRecord.title}</h3>
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600 m-0">Mô tả công việc</h4>
              <p className="text-sm text-ink-800 m-0 whitespace-pre-line leading-relaxed">{selectedRecord.description}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600 m-0">Yêu cầu ứng viên</h4>
              <p className="text-sm text-ink-800 m-0 whitespace-pre-line leading-relaxed">
                {selectedRecord.requirementsText}
              </p>
            </div>
            {selectedRecord.benefitsText && (
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-600 m-0">Quyền lợi</h4>
                <p className="text-sm text-ink-800 m-0 whitespace-pre-line leading-relaxed">
                  {selectedRecord.benefitsText}
                </p>
              </div>
            )}
          </Card>
        }
      >
        {selectedRecord.matchingSupported !== false && (
          <div className="rounded-2xl border border-border-subtle bg-white p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shrink-0">
                  <SparklesIcon size={16} />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">
                    ĐỐI SOÁT THÔNG TIN
                  </p>
                  <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5">Kiểm tra yêu cầu tuyển dụng</h3>
                </div>
              </div>

              <Badge
                tone={
                  parsedJd?.status === "CONFIRMED"
                    ? "success"
                    : parsedJd?.status === "PARSED"
                      ? "warning"
                      : "neutral"
                }
              >
                {loadingParsedJd
                  ? "Đang phân tích…"
                  : parsedJd?.status === "CONFIRMED"
                    ? "Đã xác nhận"
                    : parsedJd
                      ? "Cần kiểm tra"
                      : "Đang chờ phân tích"}
              </Badge>
            </div>

            {parsedJd && parsedJdDraft && (
              <div className="space-y-5">
                <details className="rounded-xl border border-border-subtle bg-slate-50/70 px-4 py-2.5 text-xs text-ink-700">
                  <summary className="cursor-pointer font-semibold text-ink-900">Chi tiết phân tích tự động</summary>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      <strong>Revision:</strong> v{parsedJd.revisionNumber}
                    </span>
                    <span>
                      <strong>Ngành:</strong> {parsedJdDraft.title.canonicalFamily ?? "OTHER"}
                    </span>
                    <span>
                      <strong>Cấp bậc:</strong> {parsedJdDraft.title.level ?? "—"}
                    </span>
                    <span>
                      <strong>Độ tin cậy AI:</strong> {Math.round(parsedJdDraft.overallConfidence * 100)}%
                    </span>
                  </div>
                </details>

                <p className="text-xs text-ink-600 m-0 leading-relaxed">
                  Kỹ năng mới được đề xuất riêng cho Job. Kiểm tra tên và nhóm yêu cầu trước khi xác nhận; danh mục kỹ năng chung không tự thay đổi.
                </p>

                {(["requiredSkills", "preferredSkills"] as const).map((section) => (
                  <div key={section} className="parsed-section space-y-2.5 rounded-xl border border-border-subtle bg-slate-50/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-xs font-bold uppercase tracking-wide text-ink-800">
                        {section === "requiredSkills" ? "Kỹ năng bắt buộc (Critical)" : "Kỹ năng ưu tiên (Preferred)"}
                      </strong>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={parsedJd.status === "CONFIRMED"}
                        onClick={() => onAddSkill(section)}
                      >
                        + Thêm kỹ năng
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {parsedJdDraft.requirements[section].map((skill, index) => (
                        <div key={`${section}-${index}`} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <input
                              className="h-9 flex-1 rounded-xl border border-border-strong bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
                              value={skill.raw}
                              disabled={parsedJd.status === "CONFIRMED"}
                              aria-label={`${section === "requiredSkills" ? "Kỹ năng bắt buộc" : "Kỹ năng ưu tiên"} ${index + 1}`}
                              onChange={(event) => onUpdateSkill(section, index, event.target.value)}
                              placeholder="Tên kỹ năng..."
                            />
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={parsedJd.status === "CONFIRMED"}
                              onClick={() => onRemoveSkill(section, index)}
                            >
                              Xóa
                            </Button>
                          </div>
                          {skill.normalizationStatus !== "KNOWN" && (
                            <small className="block text-[11px] text-ink-500 pl-1">
                              {parsedJd.status === "CONFIRMED"
                                ? "Dùng cho Job này · đối chiếu tên chính xác"
                                : "Kỹ năng mới · cần xác nhận cùng JD"}
                            </small>
                          )}
                        </div>
                      ))}
                    </div>

                    {parsedJdDraft.requirements[section].length === 0 && (
                      <p className="text-xs text-ink-500 m-0">Không có kỹ năng trong mục này.</p>
                    )}
                  </div>
                ))}

                <div>
                  <label className="block text-xs font-semibold text-ink-700">
                    Kinh nghiệm liên quan tối thiểu (tháng)
                    <input
                      type="number"
                      min={0}
                      className="mt-1 h-10 w-full max-w-xs rounded-xl border border-border-strong bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100"
                      disabled={parsedJd.status === "CONFIRMED"}
                      value={parsedJdDraft.requirements.minimumRelevantExperienceMonths ?? ""}
                      onChange={(event) =>
                        onUpdateExperienceMonths(
                          event.target.value === "" ? null : Math.max(0, Number(event.target.value))
                        )
                      }
                    />
                  </label>
                </div>

                {extractionNeedsManualReview(parsedJdDraft.qualityFlags) && (
                  <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 m-0">
                    Phân tích tự động chưa đầy đủ, vui lòng kiểm tra và bổ sung.
                  </p>
                )}

                {visibleQualityFlags(parsedJdDraft.qualityFlags).length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <strong>Cờ chất lượng JD:</strong> {visibleQualityFlags(parsedJdDraft.qualityFlags).join(", ")}
                  </div>
                )}

                {reviewDirty && (
                  <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800 m-0">
                    Bạn có thay đổi chưa lưu. Hãy lưu trước khi xác nhận.
                  </p>
                )}

                {parsedJd.status === "PARSED" && (
                  <div className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle pt-4">
                    <Button variant="secondary" size="md" disabled={saving || !reviewDirty} onClick={onSaveParsedJd}>
                      Lưu thay đổi yêu cầu
                    </Button>
                    <Button variant="primary" size="md" disabled={saving || reviewDirty} onClick={onConfirmParsedJd}>
                      <CheckCircleIcon size={16} /> Xác nhận yêu cầu tuyển dụng
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!parsedJd && !loadingParsedJd && (
              <p className="text-sm text-ink-500 m-0">
                Yêu cầu đang chờ phân tích. Bạn có thể quay lại tin tuyển dụng; chưa thể xác nhận khi chưa có kết quả.
              </p>
            )}
          </div>
        )}
      </DocumentReview>
    </Card>
  );
}
