import { PlusIcon, TrashIcon } from "../../shared/components/Icon";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";
import { CvDetails, CvDetailsEditor } from "./CvDetailsEditor";

export type ParsedSkill = {
  raw: string;
  canonicalSkillId?: string | null;
  normalizationStatus?: string;
  evidenceIds: string[];
  confidence?: number;
};

export type ParsedExperience = {
  titleRaw: string;
  titleCanonical: string | null;
  companyRedacted: string | null;
  startMonth: string | null;
  endMonth: string | null;
  isCurrent: boolean;
  responsibilities: string[];
  skillIds: string[];
  evidenceIds: string[];
  confidence: number;
};

export type ParsedCvPayload = CvDetails & {
  skills: ParsedSkill[];
  experiences: ParsedExperience[];
  summary: {
    totalExperienceMonths: number;
    overallConfidence?: number;
    qualityFlags?: string[];
  };
};

export type ParsedCvReviewData = {
  revisionId: string;
  revisionNumber: number;
  cvVersionId: string;
  status: string;
  payload: ParsedCvPayload;
};

type Props = {
  review: ParsedCvReviewData;
  draft: ParsedCvPayload;
  dirty: boolean;
  saving: boolean;
  confirming: boolean;
  onDraftChange: (next: ParsedCvPayload) => void;
  onSave: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

const inputClass =
  "h-9 w-full rounded-lg border border-border-strong bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none disabled:bg-slate-100 disabled:text-ink-500";
const textareaClass =
  "w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none disabled:bg-slate-100 disabled:text-ink-500";

export function ParsedCvReview({
  review,
  draft,
  dirty,
  saving,
  confirming,
  onDraftChange,
  onSave,
  onConfirm,
  onClose
}: Props) {
  const locked = review.status === "CONFIRMED" || saving || confirming;
  const incompleteFlags = ["EXTERNAL_AI_LIMIT_REACHED", "EXTERNAL_AI_NOT_CONFIGURED", "LOCAL_FALLBACK"];
  const hasIncompleteAnalysis = (review.payload.summary?.qualityFlags ?? []).some(
    (flag) => incompleteFlags.includes(flag) || flag.startsWith("EXTERNAL_AI_")
  );

  return (
    <Card padding="lg" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-subtle">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
            KIỂM TRA BẢN PHÂN TÍCH
          </p>
          <h3 className="text-lg font-bold text-ink-900 m-0 mt-0.5">
            Thông tin CV trích xuất (Phiên bản #{review.revisionNumber})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={review.status === "CONFIRMED" ? "success" : "info"}>
            {review.status === "CONFIRMED" ? "Bản phân tích đã khóa" : "Chờ kiểm tra"}
          </Badge>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Đóng bản phân tích
          </Button>
        </div>
      </div>

      {hasIncompleteAnalysis && (
        <ErrorBanner
          tone="warning"
          message="Phân tích tự động chưa đầy đủ, vui lòng kiểm tra và bổ sung."
        />
      )}

      <fieldset disabled={locked} className="space-y-6 border-0 p-0 m-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm font-bold text-ink-900">Kỹ năng</strong>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                onDraftChange({
                  ...draft,
                  skills: [...draft.skills, { raw: "", normalizationStatus: "UNKNOWN", evidenceIds: [], confidence: 1 }]
                })
              }
            >
              <PlusIcon size={14} aria-hidden="true" />
              <span>Thêm kỹ năng</span>
            </Button>
          </div>

          <div className="space-y-2.5">
            {draft.skills.map((skill, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={`Kỹ năng ${index + 1}`}
                    value={skill.raw}
                    maxLength={240}
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        skills: draft.skills.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, raw: event.target.value } : item
                        )
                      })
                    }
                    className={inputClass}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    aria-label={`Xóa kỹ năng ${skill.raw || index + 1}`}
                    onClick={() =>
                      onDraftChange({
                        ...draft,
                        skills: draft.skills.filter((_, itemIndex) => itemIndex !== index)
                      })
                    }
                  >
                    Xóa
                  </Button>
                </div>
                {skill.normalizationStatus !== "KNOWN" && (
                  <small className="block text-xs text-ink-500">
                    Chưa vào danh mục chung · có thể đối chiếu tên chính xác với yêu cầu Job đã xác nhận khi có bằng chứng CV.
                  </small>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm font-bold text-ink-900">Kinh nghiệm</strong>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                onDraftChange({
                  ...draft,
                  experiences: [
                    ...draft.experiences,
                    {
                      titleRaw: "",
                      titleCanonical: null,
                      companyRedacted: null,
                      startMonth: null,
                      endMonth: null,
                      isCurrent: false,
                      responsibilities: [],
                      skillIds: [],
                      evidenceIds: [],
                      confidence: 1
                    }
                  ]
                })
              }
            >
              <PlusIcon size={14} aria-hidden="true" />
              <span>Thêm kinh nghiệm</span>
            </Button>
          </div>

          <div className="space-y-3">
            {draft.experiences.map((experience, index) => (
              <div
                key={index}
                className="rounded-xl border border-border-subtle bg-slate-50/70 p-4 space-y-3"
              >
                <input
                  aria-label={`Chức danh ${index + 1}`}
                  value={experience.titleRaw}
                  maxLength={240}
                  placeholder="Chức danh"
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      experiences: draft.experiences.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, titleRaw: event.target.value } : item
                      )
                    })
                  }
                  className={inputClass}
                />
                <textarea
                  aria-label={`Trách nhiệm ${index + 1}`}
                  rows={3}
                  value={experience.responsibilities.join("\n")}
                  placeholder="Mỗi trách nhiệm một dòng"
                  onChange={(event) =>
                    onDraftChange({
                      ...draft,
                      experiences: draft.experiences.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              responsibilities: event.target.value
                                .split("\n")
                                .map((value) => value.trim())
                                .filter(Boolean)
                            }
                          : item
                      )
                    })
                  }
                  className={textareaClass}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <label className="block text-xs font-semibold text-ink-700">
                    Bắt đầu công việc {index + 1}
                    <input
                      type="month"
                      value={experience.startMonth ?? ""}
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          experiences: draft.experiences.map((item, i) =>
                            i === index ? { ...item, startMonth: event.target.value || null } : item
                          )
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink-700 h-9 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={experience.isCurrent}
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          experiences: draft.experiences.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  isCurrent: event.target.checked,
                                  endMonth: event.target.checked ? null : item.endMonth
                                }
                              : item
                          )
                        })
                      }
                      className="h-4 w-4 accent-brand-600"
                    />
                    <span>Đang làm việc {index + 1}</span>
                  </label>
                  <label className="block text-xs font-semibold text-ink-700">
                    Kết thúc công việc {index + 1}
                    <input
                      type="month"
                      disabled={experience.isCurrent}
                      min={experience.startMonth ?? undefined}
                      value={experience.endMonth ?? ""}
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          experiences: draft.experiences.map((item, i) =>
                            i === index ? { ...item, endMonth: event.target.value || null } : item
                          )
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      onDraftChange({
                        ...draft,
                        experiences: draft.experiences.filter((_, itemIndex) => itemIndex !== index)
                      })
                    }
                  >
                    <TrashIcon size={13} aria-hidden="true" />
                    <span>Xóa kinh nghiệm</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="block text-xs font-semibold text-ink-700 max-w-xs">
          Tổng số tháng kinh nghiệm
          <input
            type="number"
            min={0}
            value={draft.summary.totalExperienceMonths}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                summary: {
                  ...draft.summary,
                  totalExperienceMonths: Math.max(0, Number.parseInt(event.target.value || "0", 10))
                }
              })
            }
            className={`${inputClass} mt-1`}
          />
        </label>

        <CvDetailsEditor value={draft} onChange={(patch) => onDraftChange({ ...draft, ...patch })} />
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border-subtle">
        <div className="min-w-0">
          {dirty && (
            <p className="text-xs font-medium text-amber-800 m-0" role="status">
              Bạn có thay đổi chưa lưu. Lưu thay đổi trước khi xác nhận.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" variant="secondary" onClick={onSave} disabled={locked || !dirty}>
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
          {review.status === "CONFIRMED" ? (
            <Badge tone="success">Đã xác nhận</Badge>
          ) : (
            <Button type="button" onClick={onConfirm} disabled={confirming || saving || dirty}>
              {confirming ? "Đang xác nhận…" : "Xác nhận bản phân tích"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
