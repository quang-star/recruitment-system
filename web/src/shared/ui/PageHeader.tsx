import { ReactNode } from "react";
import { cn } from "./cn";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backLink?: ReactNode;
  className?: string;
};

/** Standardized page title header with optional eyebrow, back navigation, and action controls. */
export function PageHeader({ eyebrow, title, subtitle, actions, backLink, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 pb-5 mb-6 border-b border-border-subtle sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {backLink && <div className="mb-2">{backLink}</div>}
        {eyebrow && (
          <p className="text-xs font-bold uppercase tracking-wider text-brand-700 m-0 mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 m-0">{title}</h1>
        {subtitle && <p className="text-sm text-ink-500 mt-1.5 mb-0 max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
