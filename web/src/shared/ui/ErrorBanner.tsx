import { ReactNode } from "react";
import { cn } from "./cn";

export type BannerTone = "error" | "warning" | "info" | "success";

const toneStyles: Record<BannerTone, string> = {
  error: "bg-rose-50 border-rose-200 text-rose-900",
  warning: "bg-amber-50 border-amber-200 text-amber-900",
  info: "bg-sky-50 border-sky-200 text-sky-900",
  success: "bg-emerald-50 border-emerald-200 text-emerald-900"
};

type ErrorBannerProps = {
  tone?: BannerTone;
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
};

/** High-contrast alert banner using accessible role="alert" for error/warning feedback. */
export function ErrorBanner({ tone = "error", title, message, action, className }: ErrorBannerProps) {
  return (
    <div
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border px-4 py-3 text-sm leading-relaxed",
        toneStyles[tone],
        className
      )}
    >
      <div className="min-w-0">
        {title && <p className="font-semibold m-0 mb-0.5">{title}</p>}
        <p className="m-0">{message}</p>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
