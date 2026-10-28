export const externalAiPolicyVersion = "external-ai/1.0";

export function ExternalAiConsent({ checked, disabled, onChange }: {
  checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return (
    <div className="external-ai-consent">
      <label className="checkbox-label">
        <input type="checkbox" checked={checked} disabled={disabled}
          onChange={(event) => onChange(event.target.checked)} />
        Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này
      </label>
      <p className="muted">Phần nội dung nghề nghiệp được lọc và che thông tin liên hệ trước khi gửi
        tới Groq hoặc Gemini. Việc che thông tin có thể chưa đầy đủ. Nếu không chọn, bạn vẫn có thể
        phân tích cục bộ, kiểm tra và bổ sung thông tin thủ công.</p>
    </div>
  );
}

export function extractionNeedsManualReview(flags: string[]) {
  return flags.some((flag) => flag.endsWith("_FALLBACK") || flag.endsWith("_NOT_CONFIGURED")
    || flag.endsWith("_INPUT_SKIPPED") || ["EXTERNAL_AI_LIMIT_REACHED", "EXTERNAL_AI_BUDGET_UNAVAILABLE",
      "EXTERNAL_AI_ALREADY_REQUESTED", "EXTERNAL_AI_NO_PROFESSIONAL_CONTENT"].includes(flag));
}

export function visibleQualityFlags(flags: string[]) {
  // Provider/policy diagnostics stay in the revision; the UI explains fallback in prose.
  return flags.filter((flag) => !/^(EXTERNAL_AI|GROQ|GEMINI)_/.test(flag));
}
