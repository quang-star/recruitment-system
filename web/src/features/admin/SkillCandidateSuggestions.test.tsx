import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { SkillCandidateSuggestions } from "./SkillCandidateSuggestions";

vi.mock("../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const result = { taxonomyVersion: "1.0.3", resolution: "UNRESOLVED", requiresReview: true, semanticStatus: "DISABLED",
  candidates: [{ skillId: "canonical-id", canonicalName: "CanonicalX", matchedAlias: "canonical-x", fuzzyScore: 0.65, semanticScore: null }],
  algorithmVersion: "skill-candidate-ranking-v1", scorePolicy: "RANKING_ONLY_UNCALIBRATED", rankingMethod: "FUZZY_RATIO",
  fuzzyMethod: "SEQUENCE_MATCHER_RATIO_AUTOJUNK", modelId: null, modelRevision: null };
const props = { accessToken: "synthetic-admin", selected: "proposal-id", catalogVersion: 4 };
beforeEach(() => { vi.mocked(apiRequest).mockReset(); vi.mocked(apiRequest).mockResolvedValue(result); });

it("loads lexical suggestions with separate similarity values and no write controls", async () => {
  render(<SkillCandidateSuggestions {...props} />);
  await screen.findByText("CanonicalX");
  expect(apiRequest).toHaveBeenCalledWith("/api/v2/taxonomy/pending-skills/proposal-id/candidates?semantic=false&limit=5",
    { accessToken: "synthetic-admin" });
  expect(screen.getByText("0.6500")).toBeInTheDocument();
  expect(screen.getByText("Chưa tính")).toBeInTheDocument();
  expect(screen.getByText("Gợi ý cần được kiểm tra thủ công.")).toBeInTheDocument();
  expect(screen.getByLabelText("Tính thêm độ tương đồng semantic")).not.toBeChecked();
  expect(screen.queryByRole("button", { name: /Duyệt|Gộp|Chọn/ })).not.toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls.every(([, options]) => !options?.method && !options?.body)).toBe(true);
});

it("only requests semantic after opting in and keeps lexical review available when the model is unavailable", async () => {
  render(<SkillCandidateSuggestions {...props} />);
  await screen.findByText("CanonicalX");
  vi.mocked(apiRequest).mockResolvedValueOnce({ ...result, semanticStatus: "MODEL_UNAVAILABLE",
    modelId: "local-model", modelRevision: "pinned-revision" });
  fireEvent.click(screen.getByLabelText("Tính thêm độ tương đồng semantic"));
  await screen.findByText("Mô hình semantic chưa sẵn sàng. Gợi ý so chữ vẫn dùng được.");
  expect(apiRequest).toHaveBeenLastCalledWith("/api/v2/taxonomy/pending-skills/proposal-id/candidates?semantic=true&limit=5",
    { accessToken: "synthetic-admin" });
  expect(screen.getByText("CanonicalX")).toBeInTheDocument();
  expect(screen.getByText("0.6500")).toBeInTheDocument();
  expect(screen.getByText("Chưa tính")).toBeInTheDocument();
  expect(vi.mocked(apiRequest).mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it("preserves negative semantic cosine separately from fuzzy similarity", async () => {
  render(<SkillCandidateSuggestions {...props} />);
  await screen.findByText("CanonicalX");
  vi.mocked(apiRequest).mockResolvedValueOnce({ ...result, semanticStatus: "AVAILABLE", rankingMethod: "SEMANTIC_COSINE",
    candidates: [{ ...result.candidates[0], fuzzyScore: 0.2, semanticScore: -0.4 }] });
  fireEvent.click(screen.getByLabelText("Tính thêm độ tương đồng semantic"));
  await screen.findByText("-0.4000");
  const scores = within(screen.getByRole("region", { name: "Gợi ý chuẩn hóa kỹ năng" }));
  expect(scores.getByText("0.2000")).toBeInTheDocument();
  expect(scores.getByText("-0.4000")).toBeInTheDocument();
  expect(scores.queryByText(/20%|40%|accuracy|xác suất/)).not.toBeInTheDocument();
});

it("reports exact alias resolution without applying a catalog mutation", async () => {
  vi.mocked(apiRequest).mockResolvedValue({ ...result, resolution: "EXACT_ALIAS", requiresReview: false,
    semanticStatus: "NOT_NEEDED", rankingMethod: "EXACT_ALIAS" });
  render(<SkillCandidateSuggestions {...props} />);
  await screen.findByText("Có kỹ năng khớp tên hoặc alias.");
  expect(vi.mocked(apiRequest).mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it("discards an old skill response after the selected proposal changes", async () => {
  let firstResponse!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise((resolve) => { firstResponse = resolve; }));
  const view = render(<SkillCandidateSuggestions {...props} />);
  vi.mocked(apiRequest).mockResolvedValueOnce({ ...result, candidates: [{ ...result.candidates[0], canonicalName: "CurrentCanonical" }] });
  view.rerender(<SkillCandidateSuggestions {...props} selected="current-proposal" />);
  await screen.findByText("CurrentCanonical");
  await act(async () => firstResponse(result));
  await waitFor(() => expect(screen.queryByText("CanonicalX")).not.toBeInTheDocument());
  expect(screen.getByText("CurrentCanonical")).toBeInTheDocument();
});
