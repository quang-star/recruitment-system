import { HTMLAttributes } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-ink-700 border-slate-200",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-sky-50 text-sky-700 border-sky-200"
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

/** Compact status pill with semantic background and accessible border contrast. */
export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold leading-5 whitespace-nowrap",
        toneClasses[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
