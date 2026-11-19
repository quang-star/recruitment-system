import { PlusIcon, TrashIcon } from "../../shared/components/Icon";
import { Button } from "../../shared/ui";

type EvidenceFields = { evidenceIds: string[]; confidence: number };
type Education = EvidenceFields & {
  institutionRedacted: string | null;
  degreeLevel: string | null;
  fieldOfStudy: string | null;
  startMonth: string | null;
  endMonth: string | null;
};
type Language = EvidenceFields & { languageCode: string; proficiency: string | null };
type Project = EvidenceFields & { name: string; description: string | null; skillIds: string[] };
type Certificate = EvidenceFields & { name: string; issuer: string | null; issuedMonth: string | null };

export type CvDetails = {
  education: Education[];
  languages: Language[];
  projects: Project[];
  certificates: Certificate[];
};

const inputClass =
  "mt-1 h-9 w-full rounded-lg border border-border-strong bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none disabled:bg-slate-100 disabled:text-ink-500";
const textareaClass =
  "mt-1 w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none disabled:bg-slate-100 disabled:text-ink-500";
const labelClass = "block text-xs font-semibold text-ink-700";

export function CvDetailsEditor({
  value,
  onChange
}: {
  value: CvDetails;
  onChange: (patch: Partial<CvDetails>) => void;
}) {
  return (
    <div className="space-y-5">
      <fieldset className="rounded-lg border border-border-subtle bg-slate-50/70 p-4 m-0 space-y-3">
        <legend className="px-2 text-xs font-bold uppercase tracking-wider text-ink-700">Học vấn</legend>
        {(value.education ?? []).map((item, index) => {
          const update = (patch: Partial<Education>) =>
            onChange({ education: value.education.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
          return (
            <div className="rounded-lg border border-border-subtle bg-white p-3.5 space-y-3" key={index}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={labelClass}>
                  Bằng cấp {index + 1}
                  <select
                    value={item.degreeLevel ?? ""}
                    onChange={(e) => update({ degreeLevel: e.target.value || null })}
                    className={inputClass}
                  >
                    <option value="">Chưa rõ</option>
                    {[
                      ["HIGH_SCHOOL", "THPT"],
                      ["VOCATIONAL", "Trung cấp"],
                      ["ASSOCIATE", "Cao đẳng"],
                      ["BACHELOR", "Đại học"],
                      ["MASTER", "Thạc sĩ"],
                      ["DOCTORATE", "Tiến sĩ"]
                    ].map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Chuyên ngành {index + 1}
                  <input
                    maxLength={180}
                    value={item.fieldOfStudy ?? ""}
                    onChange={(e) => update({ fieldOfStudy: e.target.value || null })}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Bắt đầu học {index + 1}
                  <input
                    type="month"
                    value={item.startMonth ?? ""}
                    onChange={(e) => update({ startMonth: e.target.value || null })}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Kết thúc học {index + 1}
                  <input
                    type="month"
                    min={item.startMonth ?? undefined}
                    value={item.endMonth ?? ""}
                    onChange={(e) => update({ endMonth: e.target.value || null })}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => onChange({ education: value.education.filter((_, i) => i !== index) })}
                >
                  <TrashIcon size={13} aria-hidden="true" />
                  <span>Xóa học vấn {index + 1}</span>
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange({
              education: [
                ...(value.education ?? []),
                {
                  institutionRedacted: null,
                  degreeLevel: null,
                  fieldOfStudy: null,
                  startMonth: null,
                  endMonth: null,
                  evidenceIds: [],
                  confidence: 1
                }
              ]
            })
          }
        >
          <PlusIcon size={14} aria-hidden="true" />
          <span>Thêm học vấn</span>
        </Button>
      </fieldset>

      <fieldset className="rounded-lg border border-border-subtle bg-slate-50/70 p-4 m-0 space-y-3">
        <legend className="px-2 text-xs font-bold uppercase tracking-wider text-ink-700">Ngoại ngữ</legend>
        {(value.languages ?? []).map((item, index) => {
          const update = (patch: Partial<Language>) =>
            onChange({ languages: value.languages.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
          return (
            <div
              className="rounded-lg border border-border-subtle bg-white p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
              key={index}
            >
              <label className={labelClass}>
                Ngôn ngữ {index + 1}
                <input
                  maxLength={6}
                  pattern="[a-z]{2,3}(-[A-Z]{2})?"
                  value={item.languageCode}
                  placeholder="en, vi, ja…"
                  onChange={(e) => update({ languageCode: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Trình độ {index + 1}
                <input
                  maxLength={80}
                  value={item.proficiency ?? ""}
                  placeholder="B2, IELTS 6.5, N2…"
                  onChange={(e) => update({ proficiency: e.target.value || null })}
                  className={inputClass}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={() => onChange({ languages: value.languages.filter((_, i) => i !== index) })}
              >
                <TrashIcon size={13} aria-hidden="true" />
                <span>Xóa ngoại ngữ {index + 1}</span>
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange({
              languages: [
                ...(value.languages ?? []),
                { languageCode: "en", proficiency: null, evidenceIds: [], confidence: 1 }
              ]
            })
          }
        >
          <PlusIcon size={14} aria-hidden="true" />
          <span>Thêm ngoại ngữ</span>
        </Button>
      </fieldset>

      <fieldset className="rounded-lg border border-border-subtle bg-slate-50/70 p-4 m-0 space-y-3">
        <legend className="px-2 text-xs font-bold uppercase tracking-wider text-ink-700">Dự án</legend>
        {(value.projects ?? []).map((item, index) => {
          const update = (patch: Partial<Project>) =>
            onChange({ projects: value.projects.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
          return (
            <div className="rounded-lg border border-border-subtle bg-white p-3.5 space-y-3" key={index}>
              <label className={labelClass}>
                Tên dự án {index + 1}
                <input
                  maxLength={240}
                  value={item.name}
                  onChange={(e) => update({ name: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Mô tả dự án {index + 1}
                <textarea
                  maxLength={2000}
                  rows={2}
                  value={item.description ?? ""}
                  onChange={(e) => update({ description: e.target.value || null })}
                  className={textareaClass}
                />
              </label>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => onChange({ projects: value.projects.filter((_, i) => i !== index) })}
                >
                  <TrashIcon size={13} aria-hidden="true" />
                  <span>Xóa dự án {index + 1}</span>
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange({
              projects: [
                ...(value.projects ?? []),
                { name: "", description: null, skillIds: [], evidenceIds: [], confidence: 1 }
              ]
            })
          }
        >
          <PlusIcon size={14} aria-hidden="true" />
          <span>Thêm dự án</span>
        </Button>
      </fieldset>

      <fieldset className="rounded-lg border border-border-subtle bg-slate-50/70 p-4 m-0 space-y-3">
        <legend className="px-2 text-xs font-bold uppercase tracking-wider text-ink-700">Chứng chỉ</legend>
        {(value.certificates ?? []).map((item, index) => {
          const update = (patch: Partial<Certificate>) =>
            onChange({
              certificates: value.certificates.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
            });
          return (
            <div className="rounded-lg border border-border-subtle bg-white p-3.5 space-y-3" key={index}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className={labelClass}>
                  Tên chứng chỉ {index + 1}
                  <input
                    maxLength={240}
                    value={item.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Đơn vị cấp {index + 1}
                  <input
                    maxLength={240}
                    value={item.issuer ?? ""}
                    onChange={(e) => update({ issuer: e.target.value || null })}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  Tháng cấp {index + 1}
                  <input
                    type="month"
                    value={item.issuedMonth ?? ""}
                    onChange={(e) => update({ issuedMonth: e.target.value || null })}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => onChange({ certificates: value.certificates.filter((_, i) => i !== index) })}
                >
                  <TrashIcon size={13} aria-hidden="true" />
                  <span>Xóa chứng chỉ {index + 1}</span>
                </Button>
              </div>
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange({
              certificates: [
                ...(value.certificates ?? []),
                { name: "", issuer: null, issuedMonth: null, evidenceIds: [], confidence: 1 }
              ]
            })
          }
        >
          <PlusIcon size={14} aria-hidden="true" />
          <span>Thêm chứng chỉ</span>
        </Button>
      </fieldset>
    </div>
  );
}
