import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { SparklesIcon } from "../../shared/components/Icon";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";

type Candidate = {
  skillId: string;
  canonicalName: string;
  matchedAlias: string;
  fuzzyScore: number;
  semanticScore: number | null;
};
type CandidateResult = {
  taxonomyVersion: string;
  resolution: "EXACT_ALIAS" | "UNRESOLVED";
  requiresReview: boolean;
  candidates: Candidate[];
  semanticStatus: string;
  algorithmVersion: string;
  scorePolicy: string;
  rankingMethod: string;
  fuzzyMethod: string;
  modelId: string | null;
  modelRevision: string | null;
};

const semanticLabel: Record<string, string> = {
  DISABLED: "Semantic đang tắt.",
  NOT_NEEDED: "Tên hoặc alias đã khớp chính xác.",
  AVAILABLE: "Semantic đã tính bằng mô hình cục bộ.",
  MODEL_UNAVAILABLE: "Mô hình semantic chưa sẵn sàng. Gợi ý so chữ vẫn dùng được.",
  EMBEDDING_FAILED: "Chưa tính được semantic. Gợi ý so chữ vẫn dùng được.",
  INPUT_LIMIT: "Dữ liệu vượt giới hạn semantic. Gợi ý so chữ vẫn dùng được.",
  NO_CANONICAL_SKILLS: "Chưa có kỹ năng canonical để đối chiếu."
};

const rankingLabel: Record<string, string> = {
  FUZZY_RATIO: "Độ giống chữ",
  SEMANTIC_COSINE: "Cosine semantic",
  EXACT_ALIAS: "Tên hoặc alias chính xác"
};

export function SkillCandidateSuggestions({
  accessToken,
  selected,
  catalogVersion
}: {
  accessToken: string;
  selected: string;
  catalogVersion: number;
}) {
  const [semantic, setSemantic] = useState(false);
  const [result, setResult] = useState<CandidateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setResult(null);
    const query = new URLSearchParams({ semantic: String(semantic), limit: "5" });
    void apiRequest<CandidateResult>(`/api/v2/taxonomy/pending-skills/${selected}/candidates?${query}`, { accessToken })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : "Không tải được gợi ý kỹ năng");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, catalogVersion, semantic, accessToken, attempt]);

  return (
    <Card as="section" padding="md" className="mt-5 space-y-3 border-brand-200/80 bg-brand-50/30" aria-label="Gợi ý chuẩn hóa kỹ năng">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <SparklesIcon size={15} className="text-brand-700" />
            <h3 className="text-base font-bold text-ink-900 m-0">Gợi ý chuẩn hóa kỹ năng</h3>
          </div>
          <p className="text-xs text-ink-600 m-0 leading-relaxed">
            Điểm tương đồng chưa được hiệu chỉnh, chỉ hỗ trợ xếp hạng gợi ý. Admin kiểm tra tên, nguồn và quan hệ trước khi quyết định.
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>
          Làm mới gợi ý kỹ năng
        </Button>
      </div>

      <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-800 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
          checked={semantic}
          disabled={loading}
          onChange={(event) => setSemantic(event.target.checked)}
        />
        Tính thêm độ tương đồng semantic
      </label>

      {loading && (
        <p role="status" className="text-xs text-ink-500 m-0">
          Đang tải gợi ý kỹ năng…
        </p>
      )}
      {error && <ErrorBanner tone="error" message={error} />}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-white px-3.5 py-2.5 text-xs">
            <p role="status" className="font-medium text-ink-800 m-0">
              {semanticLabel[result.semanticStatus] ?? result.semanticStatus}
            </p>
            <Badge tone={result.requiresReview ? "warning" : "success"}>
              {result.requiresReview ? "Gợi ý cần được kiểm tra thủ công." : "Có kỹ năng khớp tên hoặc alias."}
            </Badge>
          </div>

          {result.candidates.length ? (
            <ol className="space-y-2.5 pl-0 list-none m-0">
              {result.candidates.map((candidate) => (
                <li
                  key={candidate.skillId}
                  className="rounded-xl border border-border-subtle bg-white p-3.5 shadow-xs space-y-2 break-words"
                >
                  <div>
                    <strong className="text-sm font-bold text-ink-900">{candidate.canonicalName}</strong>
                    <p className="text-xs text-ink-600 m-0 mt-0.5">Tên đối chiếu: {candidate.matchedAlias}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-xs m-0 pt-2 border-t border-border-subtle">
                    <div>
                      <dt className="font-medium text-ink-500">Độ giống chữ</dt>
                      <dd className="m-0 font-mono font-bold text-ink-900">{similarity(candidate.fuzzyScore)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-ink-500">Cosine semantic</dt>
                      <dd className="m-0 font-mono font-bold text-brand-700">{similarity(candidate.semanticScore)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ink-500 m-0">Chưa có gợi ý canonical.</p>
          )}

          <details className="rounded-xl border border-border-subtle bg-white px-3.5 py-2.5 text-xs text-ink-600">
            <summary className="cursor-pointer font-semibold text-ink-800">Thông tin phương pháp</summary>
            <div className="mt-2 space-y-1">
              <p className="m-0">
                Taxonomy: {result.taxonomyVersion} · Xếp hạng: {rankingLabel[result.rankingMethod] ?? result.rankingMethod}
              </p>
              <p className="m-0">Phiên bản thuật toán: {result.algorithmVersion}</p>
              {result.modelId && (
                <p className="m-0">
                  Mô hình: {result.modelId} · Revision: {result.modelRevision ?? "Chưa được ghi"}
                </p>
              )}
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

function similarity(value: number | null): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(4) : "Chưa tính";
}
