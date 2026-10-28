import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";

export const itIndustryId = "1";
export type CategoryChoice = {
  industryId: string | null; industryName: string;
  specializationId: string | null; specializationName: string;
  positionId: string | null; positionName: string;
};
export type CategoryEntry = {
  id: string; kind: "INDUSTRY" | "SPECIALIZATION" | "POSITION";
  parentId: string | null; name: string; status: string; version: number;
};
export const defaultCategory: CategoryChoice = {
  industryId: itIndustryId, industryName: "Công nghệ thông tin",
  specializationId: null, specializationName: "Khác", positionId: null, positionName: ""
};

export function JobCategoryFields({ value, onChange }: {
  value: CategoryChoice; onChange: (value: CategoryChoice) => void;
}) {
  const [entries, setEntries] = useState<CategoryEntry[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void apiRequest<CategoryEntry[]>("/api/v2/public/job-categories").then((result) => {
      if (!Array.isArray(result)) throw new Error("Invalid category response");
      if (active) { setEntries(result); setError(false); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  const kinds = ["INDUSTRY", "SPECIALIZATION", "POSITION"] as const;
  const keys = ["industry", "specialization", "position"] as const;
  const labels = ["Ngành", "Nhóm chuyên môn", "Vị trí"];
  return <section className="form-grid" aria-label="Phân loại tuyển dụng">
    {kinds.map((kind, index) => {
      const key = keys[index];
      const idKey = `${key}Id` as const;
      const nameKey = `${key}Name` as const;
      const parentId = index === 0 ? null : value[`${keys[index - 1]}Id`];
      const options = entries.filter((entry) => entry.kind === kind && entry.parentId === parentId);
      return <div key={kind}>
        <label htmlFor={`job-category-${key}`}>{labels[index]}</label>
        <select id={`job-category-${key}`} value={value[idKey] ?? ""} onChange={(event) => {
          const selected = options.find((entry) => entry.id === event.target.value);
          const next = { ...value, [idKey]: selected?.id ?? null, [nameKey]: selected?.name ?? "" };
          if (index < 2) { next.positionId = null; next.positionName = ""; }
          if (index === 0) { next.specializationId = null; next.specializationName = "Khác"; }
          onChange(next);
        }}>
          <option value="">Nhập {labels[index].toLowerCase()} chưa có</option>
          {value[idKey] && !options.some((entry) => entry.id === value[idKey]) &&
            <option value={value[idKey]!}>{value[nameKey]}</option>}
          {options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        {!value[idKey] && <>
          <label htmlFor={`job-category-${key}-new`}>Tên {labels[index].toLowerCase()} mới</label>
          <input id={`job-category-${key}-new`} required={index === 0} maxLength={160} value={value[nameKey]}
            onChange={(event) => onChange({ ...value, [nameKey]: event.target.value })} />
        </>}
      </div>;
    })}
    <p className="muted">Danh mục mới được dùng ngay và gửi Admin duyệt. Để trống vị trí sẽ dùng tiêu đề tin.</p>
    {value.industryId !== itIndustryId && <p role="status">Ngành này chưa hỗ trợ chấm điểm AI. Bạn vẫn đăng tin và xem hồ sơ thủ công.</p>}
    {error && <p role="status">Chưa tải được danh mục. Bạn vẫn có thể nhập tên mới.
      <button type="button" onClick={() => setAttempt((n) => n + 1)}>Tải lại danh mục</button></p>}
  </section>;
}
