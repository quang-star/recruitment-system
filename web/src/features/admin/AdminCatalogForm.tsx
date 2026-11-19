import { Dispatch, FormEvent, SetStateAction } from "react";

import { Badge, Button, Card } from "../../shared/ui";
import { CategoryEntry } from "../recruiter/JobCategoryFields";
import { SkillDefinitionFields } from "./SkillDefinitionFields";
import {
  Action,
  AdminTab,
  Skill,
  SkillCatalog,
  SkillRelation,
  categoryLabel,
  catalogStatusLabel,
  fieldClass,
  labelClass,
  textareaClass
} from "./adminTypes";

type CatalogEntrySummary = { id: string; name: string; status: string };

/** Form for creating, editing, approving, merging, deferring, or reopening categories and skills. */
export function AdminCatalogForm({
  tab,
  entries,
  categories,
  catalog,
  selected,
  current,
  active,
  targets,
  kind,
  parent,
  name,
  aliases,
  skillType,
  skillCategory,
  relations,
  reason,
  target,
  busy,
  loadedTab,
  needsReload,
  embedded = false,
  onSelect,
  onKindChange,
  onParentChange,
  onNameChange,
  onAliasesChange,
  onSkillTypeChange,
  onSkillCategoryChange,
  onRelationsChange,
  onReasonChange,
  onTargetChange,
  onAction,
  onLoadHistory
}: {
  tab: AdminTab;
  entries: CatalogEntrySummary[];
  categories: CategoryEntry[];
  catalog: SkillCatalog | null;
  selected: string;
  current: CatalogEntrySummary | undefined;
  active: boolean | undefined;
  targets: CatalogEntrySummary[];
  kind: CategoryEntry["kind"];
  parent: string;
  name: string;
  aliases: string;
  skillType: Skill["type"];
  skillCategory: Skill["category"];
  relations: SkillRelation[];
  reason: string;
  target: string;
  busy: boolean;
  loadedTab: AdminTab | null;
  needsReload: boolean;
  embedded?: boolean;
  onSelect: (id: string) => void;
  onKindChange: (value: CategoryEntry["kind"]) => void;
  onParentChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onAliasesChange: (value: string) => void;
  onSkillTypeChange: (value: Skill["type"]) => void;
  onSkillCategoryChange: (value: Skill["category"]) => void;
  onRelationsChange: Dispatch<SetStateAction<SkillRelation[]>>;
  onReasonChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onAction: (action: Action) => void;
  onLoadHistory: () => void;
}) {
  const content = (
    <div className="space-y-4">
      {embedded ? (
        (current || selected) && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {current && (
                <Badge
                  tone={
                    current.status === "ACTIVE"
                      ? "success"
                      : current.status === "PENDING"
                        ? "warning"
                        : current.status === "REJECTED"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {catalogStatusLabel[current.status] ?? current.status}
                </Badge>
              )}
            </div>
            {selected && (
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => onSelect("")}>
                + Thêm mới
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500 m-0">
              {selected ? (tab === "skills" ? "Chỉnh sửa & duyệt kỹ năng" : "Chỉnh sửa & duyệt danh mục") : tab === "skills" ? "Thêm kỹ năng mới" : "Thêm danh mục mới"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-ink-900 m-0 truncate">
                {current ? current.name : tab === "skills" ? "Tạo kỹ năng chuẩn hóa" : "Tạo danh mục nghề"}
              </h3>
              {current && (
                <Badge
                  tone={
                    current.status === "ACTIVE"
                      ? "success"
                      : current.status === "PENDING"
                        ? "warning"
                        : current.status === "REJECTED"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {catalogStatusLabel[current.status] ?? current.status}
                </Badge>
              )}
            </div>
          </div>
          {selected && (
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => onSelect("")}>
              + Thêm mới
            </Button>
          )}
        </div>
      )}

      <label className={labelClass}>
        Danh mục
        <select
          aria-label="Danh mục"
          className={fieldClass}
          disabled={busy || loadedTab !== tab}
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
        >
          <option value="">{tab === "skills" ? "Thêm kỹ năng mới" : "Thêm danh mục"}</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} · {catalogStatusLabel[entry.status] ?? entry.status}
            </option>
          ))}
        </select>
      </label>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onAction(selected ? "EDIT" : "CREATE");
        }}
      >
        <fieldset disabled={busy || loadedTab !== tab} className="border-0 p-0 m-0 min-w-0 grid gap-3">
          {tab === "skills" && catalog?.skills.find((skill) => skill.stableId === selected)?.redacted && (
            <p
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 m-0"
            >
              Tên hoặc tên gọi khác có thông tin liên hệ đã được che. Thay bằng tên kỹ năng hợp lệ trước khi sửa hoặc duyệt.
            </p>
          )}

          {!selected && tab === "categories" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Cấp
                <select
                  aria-label="Cấp"
                  className={fieldClass}
                  value={kind}
                  onChange={(e) => {
                    onKindChange(e.target.value as CategoryEntry["kind"]);
                    onParentChange("");
                  }}
                >
                  <option value="INDUSTRY">Ngành</option>
                  <option value="SPECIALIZATION">Nhóm chuyên môn</option>
                  <option value="POSITION">Vị trí</option>
                </select>
              </label>
              {kind !== "INDUSTRY" && (
                <label className={labelClass}>
                  Danh mục cha
                  <select
                    aria-label="Danh mục cha"
                    className={fieldClass}
                    required
                    value={parent}
                    onChange={(e) => onParentChange(e.target.value)}
                  >
                    <option value="">Chọn danh mục cha</option>
                    {categories
                      .filter(
                        (c) =>
                          c.status === "ACTIVE" &&
                          c.kind === (kind === "POSITION" ? "SPECIALIZATION" : "INDUSTRY")
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {selected && tab === "categories" && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-ink-600 m-0">
              Cấp: {categoryLabel[kind]}
              {parent
                ? ` · Danh mục cha: ${categories.find((category) => category.id === parent)?.name ?? parent}`
                : ""}
              . Cấp và danh mục cha được giữ nguyên sau khi tạo.
            </p>
          )}

          <label className={labelClass}>
            Tên
            <input
              className={fieldClass}
              required
              disabled={!!selected && !active}
              maxLength={tab === "skills" ? 240 : 160}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
          </label>

          {tab === "skills" && (
            <SkillDefinitionFields
              disabled={!!selected && !active}
              selected={selected}
              aliases={aliases}
              onAliasesChange={onAliasesChange}
              type={skillType}
              onTypeChange={onSkillTypeChange}
              category={skillCategory}
              onCategoryChange={onSkillCategoryChange}
              relations={relations}
              onRelationsChange={onRelationsChange}
              skills={catalog?.skills ?? []}
            />
          )}

          <label className={labelClass}>
            Lý do thay đổi
            <textarea
              className={textareaClass}
              required
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </label>
          <p className="text-xs text-ink-500 m-0">
            Lý do được lưu cùng người thực hiện và phiên bản. Duyệt sẽ lưu các giá trị đang chỉnh sửa.
          </p>

          <div role="group" aria-label="Thao tác danh mục" className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center gap-2 border-t border-border-subtle bg-white/95 px-2 py-3 backdrop-blur-sm">
            <Button variant={current?.status === "PENDING" ? "secondary" : "primary"} size="md" disabled={needsReload || (!!selected && !active)} type="submit">
              {selected ? "Lưu sửa đổi" : "Thêm danh mục"}
            </Button>

            {current?.status === "PENDING" && (
              <>
                <Button variant="primary" size="md" disabled={needsReload} onClick={() => onAction("APPROVE")}>
                  Duyệt
                </Button>
                <Button variant="secondary" size="md" disabled={needsReload} onClick={() => onAction("DEFER")}>
                  Tạm hoãn
                </Button>
                <Button variant="danger" size="md" disabled={needsReload} onClick={() => onAction("REJECT")}>
                  Từ chối
                </Button>
              </>
            )}

            {current?.status === "DEFERRED" && (
              <Button variant="secondary" size="md" disabled={needsReload} onClick={() => onAction("REOPEN")}>
                Mở lại đề xuất
              </Button>
            )}
          </div>

          {active && (
            <div className="rounded-lg border border-border-subtle bg-slate-50/70 p-3.5 space-y-2.5">
              <label className={labelClass}>
                Gộp vào danh mục đã có
                <select
                  aria-label="Gộp vào danh mục đã có"
                  className={fieldClass}
                  value={target}
                  onChange={(e) => onTargetChange(e.target.value)}
                >
                  <option value="">Chọn đích gộp</option>
                  {targets.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                size="sm"
                disabled={!target || needsReload}
                onClick={() => onAction("MERGE")}
              >
                Gộp danh mục
              </Button>
            </div>
          )}

          {selected && (
            <div>
              <Button variant="ghost" size="sm" onClick={onLoadHistory}>
                Xem lịch sử thay đổi
              </Button>
            </div>
          )}
        </fieldset>
      </form>
    </div>
  );

  return embedded ? content : <Card padding="md">{content}</Card>;
}
