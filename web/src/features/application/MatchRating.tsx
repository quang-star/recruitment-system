import { matchRating, matchSummary, type MatchPresentation } from "./matchPresentation";

export function MatchRating({ compact = false, ...application }: MatchPresentation & { compact?: boolean }) {
  const rating = matchRating(application);
  if (!rating) return <span className="text-xs font-medium text-ink-600">{matchSummary(application)}</span>;

  const description = `Mức độ phù hợp: ${matchSummary(application)}`;
  return (
    <span
      className="inline-flex flex-col items-start gap-1 max-w-full align-middle"
      role="img"
      aria-label={description}
      title={description}
    >
      <span
        className={`match-rating-stars whitespace-nowrap leading-tight ${compact ? "text-base tracking-normal" : "text-2xl tracking-wider"}`}
        aria-hidden="true"
      >
        <span className="text-amber-600">{"★".repeat(rating.stars)}</span>
        <span className="text-slate-300">{"☆".repeat(5 - rating.stars)}</span>
      </span>
      <span
        className={`inline-flex flex-wrap gap-x-2 gap-y-0.5 text-ink-700 ${compact ? "text-xs" : "text-sm"}`}
        aria-hidden="true"
      >
        <span className="font-bold text-ink-900">{rating.stars}/5</span>
        <span>{rating.label}</span>
      </span>
    </span>
  );
}
