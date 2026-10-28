import type { ApplicationMatch } from "./MatchBreakdown";

export type MatchState = "loading" | "ready" | "waiting" | "error";
export type MatchPresentation = {
  matchingSupported?: boolean;
  cvAccessGranted?: boolean;
  match?: Pick<ApplicationMatch, "status" | "finalScore"> | null;
  matchState?: MatchState;
};

const ratingLabels = ["Phù hợp rất thấp", "Phù hợp thấp", "Phù hợp trung bình", "Phù hợp cao", "Phù hợp rất cao"];

// Presentation bands only: retain the original score for calculation and ranking.
export function matchRating(application: MatchPresentation) {
  const { match } = application;
  if (application.cvAccessGranted === false || application.matchingSupported === false ||
    application.matchState === "loading" || application.matchState === "error" ||
    !match || match.status === "INSUFFICIENT_DATA" ||
    !Number.isFinite(match.finalScore) || match.finalScore < 0 || match.finalScore > 100) return null;
  const stars = Math.min(5, Math.floor(match.finalScore / 20) + 1);
  return { stars, label: ratingLabels[stars - 1] };
}

export function matchSummary(application: MatchPresentation) {
  if (application.cvAccessGranted === false) return "Đã thu hồi quyền xem";
  if (application.matchingSupported === false) return "Xem xét thủ công";
  if (application.matchState === "loading") return "Đang tải kết quả đối chiếu…";
  if (application.matchState === "error") return "Không tải được kết quả đối chiếu";
  const rating = matchRating(application);
  if (rating) return `${rating.stars}/5 sao · ${rating.label}`;
  if (application.match) return "Chưa đủ dữ liệu";
  return "Đang chờ đối chiếu";
}
