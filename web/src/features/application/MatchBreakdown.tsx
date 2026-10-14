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
  };
};

const componentLabels: Record<string, string> = {
  REQUIRED_SKILLS: "Kỹ năng bắt buộc",
  PREFERRED_SKILLS: "Kỹ năng ưu tiên",
  EXPERIENCE: "Kinh nghiệm",
  TITLE_SENIORITY: "Chức danh/cấp độ",
  EDUCATION_LANGUAGE: "Học vấn/ngôn ngữ",
  RESPONSIBILITY_SIMILARITY: "Trách nhiệm tương đồng"
};

export function MatchBreakdown({ match }: { match: ApplicationMatch }) {
  const components = match.explanation?.components ?? [];
  const claims = match.explanation?.claims ?? [];
  return <div className="match-breakdown">
    <div className="match-summary">
      <strong>{match.finalScore.toFixed(1)}/100</strong>
      <span className={`status-pill match-${match.status.toLowerCase()}`}>{match.status}</span>
    </div>
    <small className="muted">Thuật toán {match.algorithmVersion} · taxonomy {match.taxonomyVersion}</small>
    {match.qualityFlags?.length > 0 && <p className="muted">
      Cảnh báo chất lượng: {match.qualityFlags.join(", ")}. Điểm chỉ hỗ trợ sàng lọc, không tự động quyết định.
    </p>}
    {components.length > 0 && <div className="match-components">
      {components.map((component) => <div className="match-component" key={component.name}>
        <span>{componentLabels[component.name] ?? component.name}</span>
        <progress max={1} value={component.score} />
        <strong>{Math.round(component.score * 100)}%</strong>
      </div>)}
    </div>}
    {claims.length > 0 && <div className="match-claims">
      <strong>Đối chiếu kỹ năng bắt buộc</strong>
      <ul>{claims.map((claim, index) => <li key={`${claim.skillId ?? claim.subject}-${index}`}
        className={`claim-${claim.type.toLowerCase()}`}>
        {claim.type === "SUPPORTED" ? "Đáp ứng" : claim.type === "MISSING" ? "Còn thiếu" : "Chưa chắc chắn"}:
        {` ${claim.label ?? claim.skillId ?? claim.subject}`}
        {((claim.cvEvidenceIds?.length ?? 0) > 0 || (claim.jdEvidenceIds?.length ?? 0) > 0) &&
          <small className="muted"> · tham chiếu CV {claim.cvEvidenceIds?.length ?? 0}, JD {claim.jdEvidenceIds?.length ?? 0}</small>}
      </li>)}</ul>
    </div>}
  </div>;
}
