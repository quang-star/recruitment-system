import { ReactNode } from "react";
import { cn } from "./cn";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/** Clean, centered empty-state placeholder without fabricated placeholder counts. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-border-strong bg-slate-50/70 px-6 py-10",
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-border-subtle text-brand-700 shadow-xs">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-ink-900 m-0">{title}</h3>
      {description && <p className="text-sm text-ink-500 mt-1.5 mb-0 max-w-md leading-relaxed">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
