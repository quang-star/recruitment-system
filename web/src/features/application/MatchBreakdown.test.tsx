import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatchBreakdown } from "./MatchBreakdown";

describe("MatchBreakdown", () => {
  it("identifies a Job skill as an exact name comparison outside the shared taxonomy", () => {
    render(<MatchBreakdown match={{ status: "COMPLETED", finalScore: 100,
      algorithmVersion: "baseline-v5", taxonomyVersion: "1", qualityFlags: ["JOB_SCOPED_SKILLS"],
      explanation: { components: [], claims: [{ type: "SUPPORTED", subject: "JOB_REQUIRED_SKILL",
        label: "NewFrameworkX" }] } }} />);
    expect(screen.getByText(/kỹ năng riêng của Job, đối chiếu tên chính xác/)).toBeInTheDocument();
  });
  it("opens the referenced snapshot page without exposing internal evidence IDs", () => {
    const view = vi.fn();
    render(<MatchBreakdown onViewCv={view} match={{ status: "COMPLETED", finalScore: 75,
      algorithmVersion: "baseline-v4", taxonomyVersion: "1", qualityFlags: [],
      explanation: { components: [], claims: [{ type: "SUPPORTED", subject: "REQUIRED_SKILL", label: "Java",
        cvLocations: [{ id: "private-evidence-id", page: 2, start: 10, end: 14 }] }] } }} />);
    fireEvent.click(screen.getByText("Xem CV trang 2"));
    expect(view).toHaveBeenCalledWith(2);
    expect(screen.queryByText("private-evidence-id")).toBeNull();
  });
  it("renders versioned score components and missing skill claims", () => {
    render(<MatchBreakdown match={{
      status: "DEGRADED",
      finalScore: 62.5,
      algorithmVersion: "baseline-v1",
      taxonomyVersion: "1.0.0",
      qualityFlags: ["PARTIAL_REQUIREMENTS"],
      explanation: {
        components: [{ name: "REQUIRED_SKILLS", weight: 45, score: 0.5,
          contribution: 22.5, details: { matched: 1, required: 2 } }],
        claims: [{ type: "MISSING", subject: "REQUIRED_SKILL", label: "Kafka",
          cvEvidenceIds: [], jdEvidenceIds: ["jd-evidence"] }]
      }
    }} />);

    expect(screen.getByRole("img", { name: "Mức độ phù hợp: 4/5 sao · Phù hợp cao" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mức độ phù hợp: 3/5 sao · Phù hợp trung bình" })).toBeInTheDocument();
    expect(screen.queryByText("62.5/100")).not.toBeInTheDocument();
    expect(screen.getByText("Cần kiểm tra thêm")).toBeInTheDocument();
    expect(screen.getByText("Kỹ năng bắt buộc")).not.toBeNull();
    expect(screen.getByText(/Chưa tìm thấy trong CV:\s+Kafka/)).not.toBeNull();
    expect(screen.getByText(/tham chiếu CV 0, JD 1/)).not.toBeNull();
    expect(screen.getByText(/baseline-v1.*taxonomy 1.0.0/)).not.toBeNull();
    expect(screen.getByText(/Kết quả chỉ hỗ trợ sàng lọc/)).not.toBeNull();
  });
  it("does not present insufficient data or inapplicable criteria as a score", () => {
    render(<MatchBreakdown match={{ status: "INSUFFICIENT_DATA", finalScore: 0,
      algorithmVersion: "baseline-v4", taxonomyVersion: "1", qualityFlags: [],
      explanation: { components: [{ name: "EDUCATION_LANGUAGE", weight: 0, score: 1,
        contribution: 0, details: {} }], claims: [] } }} />);
    expect(screen.getByText("Chưa đủ dữ liệu để đánh giá")).toBeInTheDocument();
    expect(screen.getByText("Không áp dụng")).toBeInTheDocument();
    expect(screen.queryByText("0.0/100")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it("renders distinct badges and separate groups for supported, missing, and uncertain claims", () => {
    render(<MatchBreakdown match={{
      status: "COMPLETED",
      finalScore: 80,
      algorithmVersion: "baseline-v5",
      taxonomyVersion: "1.0.0",
      qualityFlags: [],
      explanation: {
        components: [],
        claims: [
          { type: "SUPPORTED", subject: "REQUIRED_SKILL", label: "Java" },
          { type: "MISSING", subject: "REQUIRED_SKILL", label: "Kubernetes" },
          { type: "UNCERTAIN", subject: "REQUIRED_SKILL", label: "AWS" }
        ]
      }
    }} />);
    expect(screen.getByText("1 đáp ứng")).toBeInTheDocument();
    expect(screen.getByText("1 chưa tìm thấy")).toBeInTheDocument();
    expect(screen.getByText("1 chưa chắc chắn")).toBeInTheDocument();
    expect(screen.getByText("Đã tìm thấy bằng chứng trong CV")).toBeInTheDocument();
    expect(screen.getByText("Chưa tìm thấy trong CV")).toBeInTheDocument();
    expect(screen.getByText("Chưa chắc chắn · Cần phỏng vấn hoặc kiểm tra thêm")).toBeInTheDocument();
  });
});
