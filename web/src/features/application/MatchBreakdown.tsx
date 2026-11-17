import { Badge, Button } from "../../shared/ui";
import { MatchRating } from "./MatchRating";

export type MatchComponent = {
  name: string;
  weight: number;
  score: number;
  contribution: number;
  details: Record<string, unknown>;
};

export type MatchClaim = {
  type: "SUPPORTED" | "MISSING" | "UNCERTAIN" | "COMPONENT_SUPPORTED" | "COMPONENT_PARTIAL" | "COMPONENT_MISSING" | string;
  component?: string;
  subject: string;
  skillId?: string;
  label?: string;
  cvEvidenceIds?: string[];
  jdEvidenceIds?: string[];
  jdConfirmedByRecruiter?: boolean;
  cvLocations?: Array<{ id: string; page: number | null; start: number; end: number }>;
  jdLocations?: Array<{ id: string; page: number | null; start: number; end: number }>;
  limitationCode?: string | null;
};

export type ApplicationMatch = {
  status: "COMPLETED" | "DEGRADED" | "INSUFFICIENT_DATA";
  finalScore: number;
  algorithmVersion: string;
  taxonomyVersion: string;
  qualityFlags: string[];
  explanation: {
    components: MatchComponent[];
    claims: MatchClaim[];
    penalty?: number;
    penaltyVersion?: string;
    confidence?: number;
    inputRevisions?: {
      cv: string | null;
      jd: string | null;
      asOfMonth: string | null;
      taxonomyVersions?: { cv: string; jd: string } | null;
    };
  };
};

const componentLabels: Record<string, string> = {
  REQUIRED_SKILLS: "Kỹ năng bắt buộc",
  PREFERRED_SKILLS: "Kỹ năng ưu tiên",
  EXPERIENCE: "Kinh nghiệm",
  TITLE_SENIORITY: "Chức danh & cấp bậc",
  EDUCATION_LANGUAGE: "Học vấn/ngôn ngữ",
  RESPONSIBILITY_SIMILARITY: "Trách nhiệm tương đồng"
};

const statusConfig: Record<ApplicationMatch["status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  COMPLETED: { label: "Đã đối chiếu", tone: "success" },
  DEGRADED: { label: "Cần kiểm tra thêm", tone: "warning" },
  INSUFFICIENT_DATA: { label: "Chưa đủ dữ liệu", tone: "neutral" }
};

/** Displays transparent rubric scores, verified skill claims, and clickable CV evidence jumps. */
export function MatchBreakdown({ match, onViewCv }: { match: ApplicationMatch; onViewCv?: (page: number) => void }) {
  const components = match.explanation?.components ?? [];
  const claims = match.explanation?.claims ?? [];
  const requiredSkillClaims = claims.filter((c) => !c.component || c.component === "REQUIRED_SKILLS");
  const componentClaims = claims.filter((c) => c.component && c.component !== "REQUIRED_SKILLS");
  const supportedClaims = requiredSkillClaims.filter((c) => c.type === "SUPPORTED");
  const missingClaims = requiredSkillClaims.filter((c) => c.type === "MISSING");
  const uncertainClaims = requiredSkillClaims.filter(
    (c) => c.type === "UNCERTAIN" || (c.type !== "SUPPORTED" && c.type !== "MISSING")
  );
  const confidencePct =
    typeof match.explanation?.confidence === "number"
      ? Math.round(Math.max(0, Math.min(1, match.explanation.confidence)) * 100)
      : null;
  const penaltyValue = typeof match.explanation?.penalty === "number" ? match.explanation.penalty : 0;
  const badge = statusConfig[match.status];

  const claimGroups = [
    {
      key: "supported",
      items: supportedClaims,
      heading: "Đã tìm thấy bằng chứng trong CV",
      prefix: "Đáp ứng:",
      boxClass: "border-emerald-200/80 bg-emerald-50/40",
      headingClass: "text-emerald-800"
    },
    {
      key: "missing",
      items: missingClaims,
      heading: "Chưa tìm thấy trong CV",
      prefix: "Chưa tìm thấy trong CV:",
      boxClass: "border-rose-200/80 bg-rose-50/40",
      headingClass: "text-rose-800"
    },
    {
      key: "uncertain",
      items: uncertainClaims,
      heading: "Chưa chắc chắn · Cần phỏng vấn hoặc kiểm tra thêm",
      prefix: "Chưa chắc chắn:",
      boxClass: "border-amber-200/80 bg-amber-50/40",
      headingClass: "text-amber-800"
    }
  ] as const;

  return (
    <div className="space-y-4">
      <div className="match-summary rounded-xl border border-border-subtle bg-white p-4 space-y-1.5">
        <div className="match-summary-score flex flex-wrap items-center justify-between gap-2">
          {match.status === "INSUFFICIENT_DATA" ? (
            <strong className="text-sm font-bold text-ink-900">Chưa đủ dữ liệu để đánh giá</strong>
          ) : (
            <MatchRating match={match} />
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {confidencePct !== null && match.status !== "INSUFFICIENT_DATA" && (
              <Badge tone={confidencePct >= 80 ? "success" : confidencePct >= 55 ? "neutral" : "warning"}>
                Độ tin cậy rubric: {confidencePct}%
              </Badge>
            )}
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
        </div>
        <p className="text-xs text-ink-500 m-0 leading-relaxed">
          Mức độ phù hợp với vị trí trên thang 1–5 sao, không phải xác suất trúng tuyển. Nhà tuyển dụng quyết định sau khi xem hồ sơ.
        </p>
        {penaltyValue > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1.5 m-0">
            Giảm trừ thiếu tiêu chí trọng yếu ({match.explanation.penaltyVersion ?? "penalty-v1"}): −{penaltyValue.toFixed(1)} điểm rubric (chỉ hỗ trợ ưu tiên xem xét, không tự động loại).
          </p>
        )}
      </div>

      {requiredSkillClaims.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tóm tắt kỹ năng nhanh">
          {supportedClaims.map((claim, idx) => (
            <span
              key={`sup-pill-${idx}`}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
              title="Kỹ năng đã tìm thấy trong CV"
            >
              ✓ {claim.label ?? claim.skillId ?? claim.subject}
            </span>
          ))}
          {missingClaims.map((claim, idx) => (
            <span
              key={`mis-pill-${idx}`}
              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-800"
              title="Kỹ năng chưa tìm thấy trong CV"
            >
              ✗ {claim.label ?? claim.skillId ?? claim.subject}
            </span>
          ))}
          {uncertainClaims.map((claim, idx) => (
            <span
              key={`unc-pill-${idx}`}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
              title="Cần phỏng vấn hoặc kiểm tra thêm"
            >
              ? {claim.label ?? claim.skillId ?? claim.subject}
            </span>
          ))}
        </div>
      )}

      <details className="rounded-xl border border-border-subtle bg-slate-50/70 px-3.5 py-2.5 text-xs text-ink-600">
        <summary className="cursor-pointer font-semibold text-ink-800">Chi tiết phương pháp &amp; chất lượng dữ liệu</summary>
        <div className="mt-2 space-y-1">
          <small className="block text-xs text-ink-500">
            Thuật toán {match.algorithmVersion} · taxonomy {match.taxonomyVersion}
          </small>
          {match.qualityFlags?.length > 0 && (
            <p className="text-xs text-amber-800 m-0">
              Cảnh báo chất lượng: {match.qualityFlags.join(", ")}. Kết quả chỉ hỗ trợ sàng lọc, không tự động quyết định.
            </p>
          )}
        </div>
      </details>

      {components.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {components.map((component) => (
            <div
              className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-white px-3.5 py-2.5 text-xs"
              key={component.name}
            >
              <span className="font-medium text-ink-800">{componentLabels[component.name] ?? component.name}</span>
              {component.weight > 0 ? (
                <MatchRating match={{ status: match.status, finalScore: component.score * 100 }} compact />
              ) : (
                <small className="text-xs text-ink-400">Không áp dụng</small>
              )}
            </div>
          ))}
        </div>
      )}

      {requiredSkillClaims.length > 0 && (
        <div className="match-claims space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm font-bold text-ink-900">Đối chiếu kỹ năng bắt buộc</strong>
            <div className="flex flex-wrap gap-1.5">
              {supportedClaims.length > 0 && <Badge tone="success">{supportedClaims.length} đáp ứng</Badge>}
              {missingClaims.length > 0 && <Badge tone="danger">{missingClaims.length} chưa tìm thấy</Badge>}
              {uncertainClaims.length > 0 && <Badge tone="warning">{uncertainClaims.length} chưa chắc chắn</Badge>}
            </div>
          </div>

          {claimGroups.map(
            (group) =>
              group.items.length > 0 && (
                <div key={group.key} className={`rounded-xl border p-3.5 space-y-2 ${group.boxClass}`}>
                  <span className={`block text-xs font-bold uppercase tracking-wide ${group.headingClass}`}>
                    {group.heading}
                  </span>
                  <ul className="space-y-1.5 pl-4 m-0 text-xs text-ink-800 list-disc">
                    {group.items.map((claim, index) => (
                      <li key={`${claim.skillId ?? claim.subject}-${index}`} className="leading-relaxed">
                        <span>
                          {group.prefix} {claim.label ?? claim.skillId ?? claim.subject}
                        </span>
                        {claim.subject === "JOB_REQUIRED_SKILL" && (
                          <small className="text-ink-500"> · kỹ năng riêng của Job, đối chiếu tên chính xác</small>
                        )}
                        {((claim.cvEvidenceIds?.length ?? 0) > 0 || (claim.jdEvidenceIds?.length ?? 0) > 0) && (
                          <small className="text-ink-500">
                            {" "}
                            · tham chiếu CV {claim.cvEvidenceIds?.length ?? 0}, JD {claim.jdEvidenceIds?.length ?? 0}
                          </small>
                        )}
                        {claim.cvLocations?.map((location) => (
                          <span key={location.id} className="inline-flex items-center ml-1.5">
                            {location.page && onViewCv ? (
                              <Button variant="secondary" size="sm" onClick={() => onViewCv(location.page!)}>
                                Xem CV trang {location.page}
                              </Button>
                            ) : (
                              <small className="text-ink-500">
                                {" "}
                                · CV {location.page ? `trang ${location.page}` : "chưa xác định trang"}, ký tự{" "}
                                {location.start}–{location.end}
                              </small>
                            )}
                          </span>
                        ))}
                        {claim.jdLocations?.map((location) => (
                          <small key={location.id} className="text-ink-500">
                            {" "}
                            · JD: ký tự {location.start}–{location.end}
                          </small>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )
          )}
        </div>
      )}

      {componentClaims.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-slate-50/50 p-3.5 space-y-2">
          <strong className="block text-xs font-bold uppercase tracking-wide text-ink-700">
            Căn cứ từng tiêu chí &amp; giới hạn đánh giá
          </strong>
          <ul className="space-y-1.5 pl-4 m-0 text-xs text-ink-700 list-disc">
            {componentClaims.map((claim, idx) => (
              <li key={`comp-claim-${claim.component ?? idx}-${idx}`} className="leading-relaxed">
                <span className="font-medium text-ink-900">
                  {componentLabels[claim.component ?? ""] ?? claim.component}:
                </span>{" "}
                <span>{claim.label ?? claim.subject}</span>
                {claim.limitationCode && (
                  <small className="text-amber-700"> · giới hạn: {claim.limitationCode}</small>
                )}
                {claim.cvLocations?.slice(0, 2).map((location) => (
                  <span key={location.id} className="inline-flex items-center ml-1.5">
                    {location.page && onViewCv ? (
                      <Button variant="secondary" size="sm" onClick={() => onViewCv(location.page!)}>
                        Xem CV trang {location.page}
                      </Button>
                    ) : (
                      <small className="text-ink-500">
                        · CV {location.page ? `trang ${location.page}` : "vị trí ký tự"} {location.start}–{location.end}
                      </small>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {match.explanation.inputRevisions?.asOfMonth && (
        <small className="block text-xs text-ink-500">
          Kinh nghiệm được tính đến {match.explanation.inputRevisions.asOfMonth}.
        </small>
      )}
    </div>
  );
}
