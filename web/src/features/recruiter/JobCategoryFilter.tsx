import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { CategoryEntry } from "./JobCategoryFields";

const filterSelectClass =
  "mt-1 h-9 w-full rounded-md border border-border-strong bg-white px-3 text-xs font-medium text-ink-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-400";

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
  return <div className="grid gap-3 sm:grid-cols-3" aria-label="Lọc danh mục tuyển dụng">
    <label className="block text-xs font-semibold text-ink-600">
      Lọc theo ngành
      <select className={filterSelectClass} value={value.industryId} onChange={(e) => onChange({ industryId: e.target.value, specializationId: "", positionId: "" })}>
        <option value="">Tất cả ngành</option>{entries.filter((entry) => entry.kind === "INDUSTRY")
          .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </label>
    <label className="block text-xs font-semibold text-ink-600">
      Lọc theo nhóm
      <select className={filterSelectClass} disabled={!value.industryId} value={value.specializationId}
        onChange={(e) => onChange({ ...value, specializationId: e.target.value, positionId: "" })}>
        <option value="">Tất cả nhóm</option>{entries.filter((entry) => entry.kind === "SPECIALIZATION" && entry.parentId === value.industryId)
          .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </label>
    <label className="block text-xs font-semibold text-ink-600">
      Lọc theo vị trí
      <select className={filterSelectClass} disabled={!value.specializationId} value={value.positionId}
        onChange={(e) => onChange({ ...value, positionId: e.target.value })}>
        <option value="">Tất cả vị trí</option>{entries.filter((entry) => entry.kind === "POSITION" && entry.parentId === value.specializationId)
          .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </label>
  </div>;
}
