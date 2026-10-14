import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatchBreakdown } from "./MatchBreakdown";

describe("MatchBreakdown", () => {
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

    expect(screen.getByText("62.5/100")).not.toBeNull();
    expect(screen.getByText("Kỹ năng bắt buộc")).not.toBeNull();
    expect(screen.getByText(/Còn thiếu:\s+Kafka/)).not.toBeNull();
    expect(screen.getByText(/tham chiếu CV 0, JD 1/)).not.toBeNull();
    expect(screen.getByText(/baseline-v1.*taxonomy 1.0.0/)).not.toBeNull();
    expect(screen.getByText(/Điểm chỉ hỗ trợ sàng lọc/)).not.toBeNull();
  });
});
