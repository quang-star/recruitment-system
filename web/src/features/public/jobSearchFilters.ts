export const SALARY_FILTER_OPTIONS: Record<string, { label: string; min?: number; max?: number }> = {
  under_15: { label: "Dưới 15 triệu", max: 15000000 },
  "15_30": { label: "15 – 30 triệu", min: 15000000, max: 30000000 },
  "30_50": { label: "30 – 50 triệu", min: 30000000, max: 50000000 },
  over_50: { label: "Trên 50 triệu", min: 50000000 },
};
