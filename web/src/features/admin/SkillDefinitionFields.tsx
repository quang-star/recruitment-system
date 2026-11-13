import { Dispatch, SetStateAction } from "react";

import { Button } from "../../shared/ui";
import {
  Skill,
  SkillRelation,
  fieldClass,
  labelClass,
  relationLabel,
  relationTypes,
  skillCategories,
  skillCategoryLabel,
  skillTypeLabel,
  skillTypes,
  textareaClass
} from "./adminTypes";

/** Edits skill aliases, type/category classification, and semantic relations for taxonomy curation. */
export function SkillDefinitionFields({
  disabled,
  selected,
  aliases,
  onAliasesChange,
  type,
  onTypeChange,
  category,
  onCategoryChange,
  relations,
  onRelationsChange,
  skills
}: {
  disabled: boolean;
  selected: string;
  aliases: string;
  onAliasesChange: (value: string) => void;
  type: Skill["type"];
  onTypeChange: (value: Skill["type"]) => void;
  category: Skill["category"];
  onCategoryChange: (value: Skill["category"]) => void;
  relations: SkillRelation[];
  onRelationsChange: Dispatch<SetStateAction<SkillRelation[]>>;
  skills: Skill[];
}) {
  const targets = skills.filter((skill) => skill.stableId !== selected && skill.status === "ACTIVE");
  return (
    <div className="space-y-4">
      <label className={labelClass}>
        Tên gọi khác (mỗi dòng một tên)
        <textarea
          className={textareaClass}
          rows={2}
          disabled={disabled}
          value={aliases}
          onChange={(e) => onAliasesChange(e.target.value)}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Loại kỹ năng
          <select
            aria-label="Loại kỹ năng"
            className={fieldClass}
            disabled={disabled}
            value={type}
            onChange={(e) => onTypeChange(e.target.value as Skill["type"])}
          >
            {skillTypes.map((value) => (
              <option key={value} value={value}>
                {skillTypeLabel[value]}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Nhóm kỹ năng
          <select
            aria-label="Nhóm kỹ năng"
            className={fieldClass}
            disabled={disabled}
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as Skill["category"])}
          >
            {skillCategories.map((value) => (
              <option key={value} value={value}>
                {skillCategoryLabel[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section
        aria-label="Quan hệ kỹ năng"
        className="rounded-xl border border-border-subtle bg-slate-50/70 p-4 space-y-3"
      >
        <h3 className="text-sm font-bold text-ink-900 m-0">Quan hệ kỹ năng</h3>
        {relations.map((relation, index) => (
          <div
            key={index}
            className="rounded-xl border border-border-subtle bg-white p-3 grid gap-2.5 sm:grid-cols-2"
          >
            <label className={labelClass}>
              Loại quan hệ {index + 1}
              <select
                aria-label={`Loại quan hệ ${index + 1}`}
                className={fieldClass}
                disabled={disabled}
                value={relation.type}
                onChange={(e) =>
                  onRelationsChange((rows) =>
                    rows.map((row, i) => (i === index ? { ...row, type: e.target.value as SkillRelation["type"] } : row))
                  )
                }
              >
                {relationTypes.map((value) => (
                  <option key={value} value={value}>
                    {relationLabel[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              Kỹ năng đích {index + 1}
              <select
                aria-label={`Kỹ năng đích ${index + 1}`}
                className={fieldClass}
                disabled={disabled}
                value={relation.targetSkillId}
                onChange={(e) =>
                  onRelationsChange((rows) =>
                    rows.map((row, i) => (i === index ? { ...row, targetSkillId: e.target.value } : row))
                  )
                }
              >
                <option value="">Chọn kỹ năng đang hoạt động</option>
                {relation.targetSkillId && !targets.some((skill) => skill.stableId === relation.targetSkillId) && (
                  <option value={relation.targetSkillId}>
                    {skills.find((skill) => skill.stableId === relation.targetSkillId)?.canonicalName ??
                      relation.targetSkillId}{" "}
                    (không còn hoạt động)
                  </option>
                )}
                {targets.map((skill) => (
                  <option key={skill.stableId} value={skill.stableId}>
                    {skill.canonicalName}
                  </option>
                ))}
              </select>
            </label>

            <div className="sm:col-span-2">
              <Button
                disabled={disabled}
                variant="secondary"
                size="sm"
                onClick={() => onRelationsChange((rows) => rows.filter((_, i) => i !== index))}
              >
                Xóa quan hệ {index + 1}
              </Button>
            </div>
          </div>
        ))}
        <Button
          disabled={disabled || relations.length >= 100}
          variant="secondary"
          size="sm"
          onClick={() => onRelationsChange((rows) => [...rows, { type: "RELATED", targetSkillId: "" }])}
        >
          Thêm quan hệ
        </Button>
      </section>
    </div>
  );
}
