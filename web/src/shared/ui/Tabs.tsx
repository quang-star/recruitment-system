import { cn } from "./cn";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
};

/** Accessible pill tab strip for switching panels without browser reloads. */
export function Tabs<T extends string>({ items, activeId, onChange, ariaLabel, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 border border-border-subtle",
        className
      )}
    >
      {items.map((item) => {
        const selected = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer",
              selected
                ? "bg-white text-ink-900 shadow-xs font-semibold"
                : "text-ink-600 hover:text-ink-900 hover:bg-white/60"
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 text-xs font-semibold tabular-nums-kpi",
                  selected ? "bg-brand-50 text-brand-700" : "bg-slate-200/80 text-ink-700"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
