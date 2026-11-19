import { useState, type DragEvent } from "react";
import { Button } from "../../../shared/ui";
import { createCvEntry, entryLimits, MAX_SECTION_ENTRIES, reorderArray, type CvEntry } from "./cvDocument";

export const builderInputClass =
  "mt-1 w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-600 focus:outline-none disabled:bg-slate-100";

export function CvEntryEditor({
  label,
  entries,
  onChange,
  dates = true,
  embedded = false,
}: {
  label: string;
  entries: CvEntry[];
  onChange: (entries: CvEntry[]) => void;
  dates?: boolean;
  embedded?: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function move(index: number, direction: number) {
    const next = [...entries];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  }

  function handleDragStart(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      setDragIndex(index);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-cv-entry", String(index));
    };
  }

  function handleDragOver(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      if (dragIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      if (dropIndex !== index) setDropIndex(index);
    };
  }

  function handleDrop(index: number) {
    return (event: DragEvent<HTMLDivElement>) => {
      if (dragIndex === null) return;
      event.preventDefault();
      event.stopPropagation();
      if (dragIndex !== index) {
        onChange(reorderArray(entries, dragIndex, index));
      }
      setDragIndex(null);
      setDropIndex(null);
    };
  }

  function clearDrag() {
    setDragIndex(null);
    setDropIndex(null);
  }

  const content = (
    <div className="space-y-3">
      {entries.map((entry, index) => {
        const update = (patch: Partial<CvEntry>) =>
          onChange(entries.map(item => (item.id === entry.id ? { ...item, ...patch } : item)));
        const isDragged = dragIndex === index;
        const isDropTarget = dropIndex === index && dragIndex !== index;
        return (
          <div
            key={entry.id}
            draggable
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDrop={handleDrop(index)}
            onDragEnd={clearDrag}
            className={`space-y-3 rounded-lg border bg-slate-50 p-3 transition ${
              isDragged
                ? "opacity-50 border-brand-400"
                : isDropTarget
                  ? "border-brand-500 ring-2 ring-brand-500/40"
                  : "border-transparent"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  title="Kéo để đổi vị trí mục"
                  className="cursor-grab px-1 text-xs font-bold text-ink-400 select-none"
                >
                  ⋮⋮
                </span>
                <span className="text-xs font-semibold text-ink-600">
                  {label} {index + 1}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  aria-label={`Đưa ${label.toLowerCase()} ${index + 1} lên`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={index === entries.length - 1}
                  aria-label={`Đưa ${label.toLowerCase()} ${index + 1} xuống`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Xóa ${label.toLowerCase()} ${index + 1}`}
                  onClick={() => onChange(entries.filter(item => item.id !== entry.id))}
                >
                  Xóa
                </Button>
              </div>
            </div>
            <label className="block text-xs font-medium">
              Tiêu đề {label.toLowerCase()} {index + 1}
              <input
                className={builderInputClass}
                maxLength={entryLimits.title}
                value={entry.title}
                onChange={event => update({ title: event.target.value })}
              />
            </label>
            <label className="block text-xs font-medium">
              Đơn vị / thông tin bổ sung {label.toLowerCase()} {index + 1}
              <input
                className={builderInputClass}
                maxLength={entryLimits.subtitle}
                value={entry.subtitle}
                onChange={event => update({ subtitle: event.target.value })}
              />
            </label>
            {dates && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium">
                    Bắt đầu {label.toLowerCase()} {index + 1}
                    <input
                      type="month"
                      className={builderInputClass}
                      value={entry.startMonth}
                      onChange={event => update({ startMonth: event.target.value })}
                    />
                  </label>
                  <label className="block text-xs font-medium">
                    Kết thúc {label.toLowerCase()} {index + 1}
                    <input
                      type="month"
                      className={builderInputClass}
                      disabled={entry.current}
                      min={entry.startMonth || undefined}
                      value={entry.endMonth}
                      onChange={event => update({ endMonth: event.target.value })}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={entry.current}
                    onChange={event =>
                      update({
                        current: event.target.checked,
                        endMonth: event.target.checked ? "" : entry.endMonth,
                      })
                    }
                  />
                  Đang tiếp tục {label.toLowerCase()} {index + 1}
                </label>
              </>
            )}
            <label className="block text-xs font-medium">
              Mô tả {label.toLowerCase()} {index + 1}
              <textarea
                aria-label={`Mô tả ${label.toLowerCase()} ${index + 1}`}
                rows={3}
                className={builderInputClass}
                maxLength={entryLimits.description}
                value={entry.description}
                onChange={event => update({ description: event.target.value })}
              />
            </label>
          </div>
        );
      })}
      <Button
        variant="secondary"
        size="sm"
        disabled={entries.length >= MAX_SECTION_ENTRIES}
        onClick={() => onChange([...entries, createCvEntry()])}
      >
        Thêm {label.toLowerCase()}
      </Button>
    </div>
  );

  if (embedded) return content;

  return (
    <fieldset className="m-0 min-w-0 space-y-3 rounded-lg border border-border-subtle p-4">
      <legend className="px-2 text-sm font-bold text-ink-900">{label}</legend>
      {content}
    </fieldset>
  );
}
