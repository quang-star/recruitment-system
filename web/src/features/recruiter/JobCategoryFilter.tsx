import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { CategoryEntry } from "./JobCategoryFields";

export type CategoryFilterValue = { industryId: string; specializationId: string; positionId: string };
export const emptyCategoryFilter: CategoryFilterValue = { industryId: "", specializationId: "", positionId: "" };
export function JobCategoryFilter({ value, onChange }: { value: CategoryFilterValue; onChange: (value: CategoryFilterValue) => void }) {
  const [entries, setEntries] = useState<CategoryEntry[]>([]);
  useEffect(() => {
    let active = true;
    void apiRequest<CategoryEntry[]>("/api/v2/public/job-categories")
      .then((result) => { if (active && Array.isArray(result)) setEntries(result); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div className="job-filters" aria-label="Lọc danh mục tuyển dụng">
    <label>Lọc theo ngành<select value={value.industryId} onChange={(e) => onChange({ industryId: e.target.value, specializationId: "", positionId: "" })}>
      <option value="">Tất cả ngành</option>{entries.filter((entry) => entry.kind === "INDUSTRY")
        .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label>
    <label>Lọc theo nhóm<select disabled={!value.industryId} value={value.specializationId}
      onChange={(e) => onChange({ ...value, specializationId: e.target.value, positionId: "" })}>
      <option value="">Tất cả nhóm</option>{entries.filter((entry) => entry.kind === "SPECIALIZATION" && entry.parentId === value.industryId)
        .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label>
    <label>Lọc theo vị trí<select disabled={!value.specializationId} value={value.positionId}
      onChange={(e) => onChange({ ...value, positionId: e.target.value })}>
      <option value="">Tất cả vị trí</option>{entries.filter((entry) => entry.kind === "POSITION" && entry.parentId === value.specializationId)
        .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label>
  </div>;
}
