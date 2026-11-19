export const externalAiPolicyVersion = "external-ai/1.0";

export function ExternalAiConsent({ checked, disabled, onChange }: {
  checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/70 p-3.5">
      <label className="flex items-start gap-2.5 text-sm font-semibold text-ink-900 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border-strong text-brand-600 accent-brand-600 shrink-0"
        />
        <span>Cho phép AI phân tích nội dung này</span>
      </label>
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
