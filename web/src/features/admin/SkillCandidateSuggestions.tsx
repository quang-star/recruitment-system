import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";

type Candidate = { skillId: string; canonicalName: string; matchedAlias: string; fuzzyScore: number; semanticScore: number | null };
type CandidateResult = { taxonomyVersion: string; resolution: "EXACT_ALIAS" | "UNRESOLVED"; requiresReview: boolean;
  candidates: Candidate[]; semanticStatus: string; algorithmVersion: string; scorePolicy: string;
  rankingMethod: string; fuzzyMethod: string; modelId: string | null; modelRevision: string | null };
const semanticLabel: Record<string, string> = {
  DISABLED: "Semantic đang tắt.", NOT_NEEDED: "Tên hoặc alias đã khớp chính xác.",
  AVAILABLE: "Semantic đã tính bằng mô hình cục bộ.",
  MODEL_UNAVAILABLE: "Mô hình semantic chưa sẵn sàng. Gợi ý so chữ vẫn dùng được.",
  EMBEDDING_FAILED: "Chưa tính được semantic. Gợi ý so chữ vẫn dùng được.",
  INPUT_LIMIT: "Dữ liệu vượt giới hạn semantic. Gợi ý so chữ vẫn dùng được.",
  NO_CANONICAL_SKILLS: "Chưa có kỹ năng canonical để đối chiếu."
};
const rankingLabel: Record<string, string> = { FUZZY_RATIO: "Độ giống chữ", SEMANTIC_COSINE: "Cosine semantic", EXACT_ALIAS: "Tên hoặc alias chính xác" };

export function SkillCandidateSuggestions({ accessToken, selected, catalogVersion }: {
  accessToken: string; selected: string; catalogVersion: number;
}) {
  const [semantic, setSemantic] = useState(false);
  const [result, setResult] = useState<CandidateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setResult(null);
    const query = new URLSearchParams({ semantic: String(semantic), limit: "5" });
    void apiRequest<CandidateResult>(`/api/v2/taxonomy/pending-skills/${selected}/candidates?${query}`, { accessToken }).then((value) => {
      if (active) setResult(value);
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Không tải được gợi ý kỹ năng"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, catalogVersion, semantic, accessToken, attempt]);
  return <section aria-label="Gợi ý chuẩn hóa kỹ năng" style={{ marginTop: 20 }}>
    <h3>Gợi ý chuẩn hóa kỹ năng</h3>
    <p className="muted">Điểm tương đồng chưa được hiệu chỉnh, chỉ hỗ trợ xếp hạng gợi ý. Admin kiểm tra tên, nguồn và quan hệ trước khi quyết định.</p>
    <label className="checkbox-label"><input type="checkbox" checked={semantic} disabled={loading}
      onChange={(event) => setSemantic(event.target.checked)} />Tính thêm độ tương đồng semantic</label>
    <button type="button" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>Làm mới gợi ý kỹ năng</button>
    {loading && <p role="status">Đang tải gợi ý kỹ năng…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <>
      <p role="status">{semanticLabel[result.semanticStatus] ?? result.semanticStatus}</p>
      <p>{result.requiresReview ? "Gợi ý cần được kiểm tra thủ công." : "Có kỹ năng khớp tên hoặc alias."}</p>
      {result.candidates.length ? <ol>{result.candidates.map((candidate) => <li key={candidate.skillId} style={{ overflowWrap: "anywhere", marginBottom: 12 }}>
        <strong>{candidate.canonicalName}</strong><p>Tên đối chiếu: {candidate.matchedAlias}</p>
        <dl><dt>Độ giống chữ</dt><dd>{similarity(candidate.fuzzyScore)}</dd>
          <dt>Cosine semantic</dt><dd>{similarity(candidate.semanticScore)}</dd></dl>
      </li>)}</ol> : <p>Chưa có gợi ý canonical.</p>}
      <details><summary>Thông tin phương pháp</summary>
        <p>Taxonomy: {result.taxonomyVersion} · Xếp hạng: {rankingLabel[result.rankingMethod] ?? result.rankingMethod}</p>
        <p>Phiên bản thuật toán: {result.algorithmVersion}</p>
        {result.modelId && <p>Mô hình: {result.modelId} · Revision: {result.modelRevision ?? "Chưa được ghi"}</p>}
      </details>
    </>}
  </section>;
}

function similarity(value: number | null): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(4) : "Chưa tính";
}
