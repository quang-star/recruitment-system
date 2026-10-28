import { matchRating, matchSummary, type MatchPresentation } from "./matchPresentation";
import "./MatchRating.css";

export function MatchRating({ compact = false, ...application }: MatchPresentation & { compact?: boolean }) {
  const rating = matchRating(application);
  if (!rating) return <span>{matchSummary(application)}</span>;

  const description = `Mức độ phù hợp: ${matchSummary(application)}`;
  return (
    <span className={`match-rating${compact ? " match-rating-compact" : ""}`} role="img" aria-label={description} title={description}>
      <span className="match-rating-stars" aria-hidden="true">
        <span className="match-rating-filled">{"★".repeat(rating.stars)}</span>
        <span className="match-rating-empty">{"☆".repeat(5 - rating.stars)}</span>
      </span>
      <span className="match-rating-caption" aria-hidden="true">
        <span className="match-rating-count">{rating.stars}/5</span>
        <span>{rating.label}</span>
      </span>
    </span>
  );
}
