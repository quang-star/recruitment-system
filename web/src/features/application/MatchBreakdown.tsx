import { MatchRating } from "./MatchRating";

export type MatchComponent = {
  name: string;
  weight: number;
  score: number;
  contribution: number;
  details: Record<string, unknown>;
};

export type MatchClaim = {
  type: "SUPPORTED" | "MISSING" | "UNCERTAIN";
  subject: string;
  skillId?: string;
  label?: string;
  cvEvidenceIds?: string[];
  jdEvidenceIds?: string[];
  jdConfirmedByRecruiter?: boolean;
  cvLocations?: Array<{ id: string; page: number | null; start: number; end: number }>;
  jdLocations?: Array<{ id: string; page: number | null; start: number; end: number }>;
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
    inputRevisions?: { cv: string | null; jd: string | null; asOfMonth: string | null; taxonomyVersions?: { cv: string; jd: string } | null };
  };
};

const componentLabels: Record<string, string> = {
  REQUIRED_SKILLS: "Kỹ năng bắt buộc",
  PREFERRED_SKILLS: "Kỹ năng ưu tiên",
  EXPERIENCE: "Kinh nghiệm",
  TITLE_SENIORITY: "Nhóm chức danh",
  EDUCATION_LANGUAGE: "Học vấn/ngôn ngữ",
  RESPONSIBILITY_SIMILARITY: "Trách nhiệm tương đồng"
};

export function MatchBreakdown({ match, onViewCv }: { match: ApplicationMatch; onViewCv?: (page: number) => void }) {
  const components = match.explanation?.components ?? [];
  const claims = match.explanation?.claims ?? [];
  const supportedClaims = claims.filter((c) => c.type === "SUPPORTED");
  const missingClaims = claims.filter((c) => c.type === "MISSING");
  const uncertainClaims = claims.filter((c) => c.type === "UNCERTAIN" || (c.type !== "SUPPORTED" && c.type !== "MISSING"));

  return (
    <div className="match-breakdown">
      <div className="match-summary">
        <div>
          <div className="match-summary-score">
            {match.status === "INSUFFICIENT_DATA" ? <strong>Chưa đủ dữ liệu để đánh giá</strong> : <MatchRating match={match} />}
            <span className={`status-pill match-${match.status.toLowerCase()}`}>
              {{ COMPLETED: "Đã đối chiếu", DEGRADED: "Cần kiểm tra thêm", INSUFFICIENT_DATA: "Chưa đủ dữ liệu" }[match.status]}
            </span>
          </div>
          <p className="muted match-score-disclaimer">
            Mức độ phù hợp với vị trí trên thang 1–5 sao, không phải xác suất trúng tuyển. Nhà tuyển dụng quyết định sau khi xem hồ sơ.
          </p>
        </div>
      </div>

      {claims.length > 0 && (
        <div className="match-quick-skills-overview" aria-label="Tóm tắt kỹ năng nhanh">
          {supportedClaims.map((claim, idx) => (
            <span key={`sup-pill-${idx}`} className="skill-pill-chip supported" title="Kỹ năng đã tìm thấy trong CV">
              ✓ {claim.label ?? claim.skillId ?? claim.subject}
            </span>
          ))}
          {missingClaims.map((claim, idx) => (
            <span key={`mis-pill-${idx}`} className="skill-pill-chip missing" title="Kỹ năng chưa tìm thấy trong CV">
              ✗ {claim.label ?? claim.skillId ?? claim.subject}
            </span>
          ))}
          {uncertainClaims.map((claim, idx) => (
            <span key={`unc-pill-${idx}`} className="skill-pill-chip uncertain" title="Cần phỏng vấn hoặc kiểm tra thêm">
              ? {claim.label ?? claim.skillId ?? claim.subject}
            </span>
          ))}
        </div>
      )}

      <details className="match-technical-details">
        <summary>Chi tiết phương pháp &amp; chất lượng dữ liệu</summary>
        <div className="match-technical-body">
          <small className="muted">Thuật toán {match.algorithmVersion} · taxonomy {match.taxonomyVersion}</small>
          {match.qualityFlags?.length > 0 && (
            <p className="muted">
              Cảnh báo chất lượng: {match.qualityFlags.join(", ")}. Kết quả chỉ hỗ trợ sàng lọc, không tự động quyết định.
            </p>
          )}
        </div>
      </details>

      {components.length > 0 && (
        <div className="match-components">
          {components.map((component) => (
            <div className="match-component match-component-rating" key={component.name}>
              <span>{componentLabels[component.name] ?? component.name}</span>
              {component.weight > 0 ? (
                <MatchRating match={{ status: match.status, finalScore: component.score * 100 }} compact />
              ) : (
                <small>Không áp dụng</small>
              )}
            </div>
          ))}
        </div>
      )}

      {claims.length > 0 && (
        <div className="match-claims">
          <div className="match-claims-head">
            <strong>Đối chiếu kỹ năng bắt buộc</strong>
            <div className="match-claims-badges">
              {supportedClaims.length > 0 && (
                <span className="claims-badge supported">{supportedClaims.length} đáp ứng</span>
              )}
              {missingClaims.length > 0 && (
                <span className="claims-badge missing">{missingClaims.length} chưa tìm thấy</span>
              )}
              {uncertainClaims.length > 0 && (
                <span className="claims-badge uncertain">{uncertainClaims.length} chưa chắc chắn</span>
              )}
            </div>
          </div>

          {supportedClaims.length > 0 && (
            <div className="match-claims-group match-claims-supported-group">
              <span className="claims-group-heading supported-heading">Đã tìm thấy bằng chứng trong CV</span>
              <ul>
                {supportedClaims.map((claim, index) => (
                  <li
                    key={`${claim.skillId ?? claim.subject}-${index}`}
                    className={`claim-${claim.type.toLowerCase()}`}
                  >
                    Đáp ứng:
                    {` ${claim.label ?? claim.skillId ?? claim.subject}`}
                    {claim.subject === "JOB_REQUIRED_SKILL" && (
                      <small className="muted"> · kỹ năng riêng của Job, đối chiếu tên chính xác</small>
                    )}
                    {((claim.cvEvidenceIds?.length ?? 0) > 0 || (claim.jdEvidenceIds?.length ?? 0) > 0) && (
                      <small className="muted"> · tham chiếu CV {claim.cvEvidenceIds?.length ?? 0}, JD {claim.jdEvidenceIds?.length ?? 0}</small>
                    )}
                    {claim.cvLocations?.map((location) => (
                      <span key={location.id}>
                        {location.page && onViewCv ? (
                          <button
                            type="button"
                            className="secondary-button cv-evidence-jump-btn"
                            onClick={() => onViewCv(location.page!)}
                          >
                            Xem CV trang {location.page}
                          </button>
                        ) : (
                          <small> · CV {location.page ? `trang ${location.page}` : "chưa xác định trang"}, ký tự {location.start}–{location.end}</small>
                        )}
                      </span>
                    ))}
                    {claim.jdLocations?.map((location) => (
                      <small key={location.id}> · JD: ký tự {location.start}–{location.end}</small>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {missingClaims.length > 0 && (
            <div className="match-claims-group match-claims-missing-group">
              <span className="claims-group-heading missing-heading">Chưa tìm thấy trong CV</span>
              <ul>
                {missingClaims.map((claim, index) => (
                  <li
                    key={`${claim.skillId ?? claim.subject}-${index}`}
                    className={`claim-${claim.type.toLowerCase()}`}
                  >
                    Chưa tìm thấy trong CV:
                    {` ${claim.label ?? claim.skillId ?? claim.subject}`}
                    {claim.subject === "JOB_REQUIRED_SKILL" && (
                      <small className="muted"> · kỹ năng riêng của Job, đối chiếu tên chính xác</small>
                    )}
                    {((claim.cvEvidenceIds?.length ?? 0) > 0 || (claim.jdEvidenceIds?.length ?? 0) > 0) && (
                      <small className="muted"> · tham chiếu CV {claim.cvEvidenceIds?.length ?? 0}, JD {claim.jdEvidenceIds?.length ?? 0}</small>
                    )}
                    {claim.cvLocations?.map((location) => (
                      <span key={location.id}>
                        {location.page && onViewCv ? (
                          <button
                            type="button"
                            className="secondary-button cv-evidence-jump-btn"
                            onClick={() => onViewCv(location.page!)}
                          >
                            Xem CV trang {location.page}
                          </button>
                        ) : (
                          <small> · CV {location.page ? `trang ${location.page}` : "chưa xác định trang"}, ký tự {location.start}–{location.end}</small>
                        )}
                      </span>
                    ))}
                    {claim.jdLocations?.map((location) => (
                      <small key={location.id}> · JD: ký tự {location.start}–{location.end}</small>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uncertainClaims.length > 0 && (
            <div className="match-claims-group match-claims-uncertain-group">
              <span className="claims-group-heading uncertain-heading">Chưa chắc chắn · Cần phỏng vấn hoặc kiểm tra thêm</span>
              <ul>
                {uncertainClaims.map((claim, index) => (
                  <li
                    key={`${claim.skillId ?? claim.subject}-${index}`}
                    className={`claim-${claim.type.toLowerCase()}`}
                  >
                    Chưa chắc chắn:
                    {` ${claim.label ?? claim.skillId ?? claim.subject}`}
                    {claim.subject === "JOB_REQUIRED_SKILL" && (
                      <small className="muted"> · kỹ năng riêng của Job, đối chiếu tên chính xác</small>
                    )}
                    {((claim.cvEvidenceIds?.length ?? 0) > 0 || (claim.jdEvidenceIds?.length ?? 0) > 0) && (
                      <small className="muted"> · tham chiếu CV {claim.cvEvidenceIds?.length ?? 0}, JD {claim.jdEvidenceIds?.length ?? 0}</small>
                    )}
                    {claim.cvLocations?.map((location) => (
                      <span key={location.id}>
                        {location.page && onViewCv ? (
                          <button
                            type="button"
                            className="secondary-button cv-evidence-jump-btn"
                            onClick={() => onViewCv(location.page!)}
                          >
                            Xem CV trang {location.page}
                          </button>
                        ) : (
                          <small> · CV {location.page ? `trang ${location.page}` : "chưa xác định trang"}, ký tự {location.start}–{location.end}</small>
                        )}
                      </span>
                    ))}
                    {claim.jdLocations?.map((location) => (
                      <small key={location.id}> · JD: ký tự {location.start}–{location.end}</small>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {match.explanation.inputRevisions?.asOfMonth && (
        <small className="muted">
          Kinh nghiệm được tính đến {match.explanation.inputRevisions.asOfMonth}.
        </small>
      )}
    </div>
  );
}
