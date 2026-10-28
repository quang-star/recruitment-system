import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchRating } from "./MatchRating";
import type { MatchPresentation } from "./matchPresentation";

describe("MatchRating", () => {
  it.each<[number, number, string, string]>([
    [0, 1, "Phù hợp rất thấp", "★☆☆☆☆"],
    [19.999, 1, "Phù hợp rất thấp", "★☆☆☆☆"],
    [20, 2, "Phù hợp thấp", "★★☆☆☆"],
    [39.999, 2, "Phù hợp thấp", "★★☆☆☆"],
    [40, 3, "Phù hợp trung bình", "★★★☆☆"],
    [59.999, 3, "Phù hợp trung bình", "★★★☆☆"],
    [60, 4, "Phù hợp cao", "★★★★☆"],
    [79.999, 4, "Phù hợp cao", "★★★★☆"],
    [80, 5, "Phù hợp rất cao", "★★★★★"],
    [100, 5, "Phù hợp rất cao", "★★★★★"],
  ])("presents score %s using whole stars without rounding across a band", (score, stars, label, symbols) => {
    render(<MatchRating match={{ status: "COMPLETED", finalScore: score }} />);
    const rating = screen.getByRole("img", { name: `Mức độ phù hợp: ${stars}/5 sao · ${label}` });
    expect(rating.querySelector(".match-rating-stars")).toHaveTextContent(symbols);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([-1, 101, NaN, Infinity])("does not turn invalid score %s into a rating", (finalScore) => {
    render(<MatchRating match={{ status: "COMPLETED", finalScore }} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Chưa đủ dữ liệu")).toBeInTheDocument();
  });

  it.each<[Partial<MatchPresentation>, string]>([
    [{ cvAccessGranted: false }, "Đã thu hồi quyền xem"],
    [{ matchingSupported: false }, "Xem xét thủ công"],
    [{ matchState: "loading" }, "Đang tải kết quả đối chiếu…"],
    [{ matchState: "error" }, "Không tải được kết quả đối chiếu"],
    [{ match: { status: "INSUFFICIENT_DATA", finalScore: 0 } }, "Chưa đủ dữ liệu"],
    [{ match: null }, "Đang chờ đối chiếu"],
  ])("keeps state messages separate from ratings (%j)", (override, message) => {
    render(<MatchRating match={{ status: "COMPLETED", finalScore: 90 }} {...override} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
