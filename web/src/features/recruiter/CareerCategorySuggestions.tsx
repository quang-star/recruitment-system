import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { externalAiPolicyVersion } from "../../shared/components/ExternalAiConsent";
import type { CategoryChoice } from "./JobCategoryFields";

type Suggestion = { category: CategoryChoice; evidenceQuotes: string[] };
type SuggestionResponse = {
  status: "SUGGESTED" | "MANUAL";
  reasonCode: string | null;
  inputHash: string;
  catalogHash: string | null;
  suggestions: Suggestion[];
};

export type CareerDraft = {
  title: string; description: string; requirementsText: string; externalAiConsent: boolean;
};

const manualMessages: Record<string, string> = {
  EXTERNAL_AI_NOT_CONSENTED: "Chọn cho phép AI bên ngoài trước khi yêu cầu gợi ý nghề.",
  EXTERNAL_AI_LIMIT_REACHED: "Đã hết lượt AI hôm nay. Bạn vẫn có thể nhập phân loại thủ công.",
  EXTERNAL_AI_ALREADY_REQUESTED: "Nội dung này đã được yêu cầu gợi ý. Bạn vẫn có thể nhập phân loại thủ công.",
  EXTERNAL_AI_INPUT_SKIPPED: "Nội dung vượt giới hạn gợi ý. Bạn vẫn có thể nhập phân loại thủ công.",
  EXTERNAL_AI_NO_PROFESSIONAL_CONTENT: "Chưa có nội dung nghề nghiệp phù hợp để gợi ý. Bạn vẫn có thể nhập phân loại thủ công.",
  INVALID_SUGGESTION: "Chưa có gợi ý hợp lệ. Bạn vẫn có thể nhập phân loại thủ công.",
  NO_SUGGESTION: "Chưa có gợi ý phù hợp. Bạn vẫn có thể nhập phân loại thủ công.",
};
const unavailableMessage = "Gợi ý nghề hiện chưa khả dụng. Bạn vẫn có thể nhập phân loại thủ công.";

export function CareerCategorySuggestions({ draft, userId, companyId, jobId, jobVersionId,
  accessToken, disabled, onApply }: {
  draft: CareerDraft; userId: string; companyId: string; jobId: string | null; jobVersionId: string | null;
  accessToken: string; disabled: boolean; onApply: (value: CategoryChoice) => void;
}) {
  const context = JSON.stringify([userId, companyId, jobId, jobVersionId, disabled,
    draft.title, draft.description, draft.requirementsText, draft.externalAiConsent]);
  const currentContext = useRef(context);
  currentContext.current = context;
  const sequence = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{ context: string; data: SuggestionResponse } | null>(null);
  const [notice, setNotice] = useState<{ context: string; message: string } | null>(null);
  const [busyContext, setBusyContext] = useState<string | null>(null);
  useEffect(() => {
    sequence.current += 1;
    pending.current?.abort();
    setResult(null); setNotice(null); setBusyContext(null);
    return () => { sequence.current += 1; pending.current?.abort(); };
  }, [context]);

  const busy = busyContext === context;
  const visible = result?.context === context ? result.data : null;
  async function requestSuggestions() {
    if (disabled || busy || !draft.externalAiConsent || !draft.title.trim()) return;
    const requestSequence = ++sequence.current;
    const controller = new AbortController();
    pending.current?.abort(); pending.current = controller;
    setBusyContext(context); setResult(null); setNotice(null);
    const current = () => !controller.signal.aborted && sequence.current === requestSequence
      && currentContext.current === context;
    try {
      const data = await apiRequest<SuggestionResponse>("/api/v2/parsed-jds/category-suggestions", {
        method: "POST", accessToken, signal: controller.signal,
        body: JSON.stringify({ title: draft.title, description: draft.description,
          requirementsText: draft.requirementsText, externalAiConsent: true,
          externalAiPolicyVersion }),
      });
      if (!current()) return;
      if (!validResponse(data)) throw new Error("Invalid category suggestion response");
      setResult({ context, data });
      if (data.status === "MANUAL") setNotice({ context,
        message: manualMessages[data.reasonCode ?? ""] ?? unavailableMessage });
    } catch {
      if (current()) setNotice({ context, message: unavailableMessage });
    } finally {
      if (current()) setBusyContext(null);
    }
  }

  return <section className="form-section-card" aria-label="Gợi ý phân loại nghề">
    <h4>Gợi ý phân loại nghề từ JD</h4>
    <p className="muted">Kiểm tra ngành, nhóm chuyên môn, vị trí và trích dẫn trước khi áp dụng.
      Gợi ý chỉ điền biểu mẫu; bạn cần lưu bản nháp để ghi nhận thay đổi.</p>
    <button type="button" className="secondary-button" onClick={() => void requestSuggestions()}
      disabled={disabled || busy || !draft.externalAiConsent || !draft.title.trim()}>
      {busy ? "Đang gợi ý nghề…" : "Gợi ý phân loại nghề"}
    </button>
    {!draft.externalAiConsent && <p className="muted">Chọn cho phép AI bên ngoài để dùng gợi ý nghề. Bạn vẫn có thể nhập thủ công.</p>}
    {notice?.context === context && <p role="status">{notice.message}</p>}
    {visible?.status === "SUGGESTED" && <ol>
      {visible.suggestions.map((suggestion, index) => <li key={index}>
        <p><strong>{suggestion.category.industryName}</strong> · {suggestion.category.specializationName} · {suggestion.category.positionName}</p>
        <p className="muted">Trích dẫn từ nội dung nghề nghiệp đã lọc:</p>
        {suggestion.evidenceQuotes.map((quote, quoteIndex) => <blockquote key={quoteIndex}>{quote}</blockquote>)}
        {[suggestion.category.industryId, suggestion.category.specializationId, suggestion.category.positionId].some((id) => id === null)
          && <p className="muted">Có tên mới; khi lưu, danh mục mới sẽ được gửi Admin duyệt.</p>}
        <button type="button" className="secondary-button" disabled={disabled}
          onClick={() => { if (currentContext.current === context) onApply({ ...suggestion.category }); }}>
          Áp dụng gợi ý {index + 1}
        </button>
      </li>)}
    </ol>}
  </section>;
}

function validResponse(value: SuggestionResponse): boolean {
  if (!value || !["SUGGESTED", "MANUAL"].includes(value.status) || !Array.isArray(value.suggestions)
    || value.suggestions.length > 3 || !(value.reasonCode === null || typeof value.reasonCode === "string")
    || typeof value.inputHash !== "string"
    || !/^[a-f0-9]{64}$/.test(value.inputHash)
    || !(value.catalogHash === null || typeof value.catalogHash === "string" && /^[a-f0-9]{64}$/.test(value.catalogHash))) return false;
  if (value.status === "MANUAL") return value.suggestions.length === 0;
  return value.suggestions.length > 0 && value.suggestions.every((suggestion) => suggestion?.category
    && ["industry", "specialization", "position"].every((key) => {
      const name = suggestion.category[`${key}Name` as keyof CategoryChoice];
      const id = suggestion.category[`${key}Id` as keyof CategoryChoice];
      return typeof name === "string" && !!name.trim() && name.length <= 160
        && (id === null || typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id));
    }) && Array.isArray(suggestion.evidenceQuotes) && suggestion.evidenceQuotes.length >= 1
    && suggestion.evidenceQuotes.length <= 3 && suggestion.evidenceQuotes.every((quote) => typeof quote === "string"
      && !!quote.trim() && quote.length <= 240));
}
