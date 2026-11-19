import { BRAND_CONFIG } from "../config/brand";
import { cn } from "../ui";

type BrandMarkSize = "sm" | "md" | "lg";

const ICON_SIZE_CLASSES: Record<BrandMarkSize, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10"
};

type Props = {
  size?: BrandMarkSize;
  showWordmark?: boolean;
  dark?: boolean;
  wordmark?: string;
  iconClassName?: string;
  className?: string;
};

/** Shared school emblem and horizontal "| Jobs." brand lockup rendered from /logo.png. */
export function BrandMark({
  size = "md",
  showWordmark = false,
  dark = false,
  wordmark,
  iconClassName,
  className
}: Props) {
  const customWordmark = (wordmark ?? BRAND_CONFIG.name).trim();

  return (
    <span className={cn("inline-flex items-center gap-2.5 shrink-0", className)}>
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        className={cn(ICON_SIZE_CLASSES[size], "shrink-0 rounded-lg object-contain", iconClassName)}
      />
      {showWordmark && (
        <>
          <span
            aria-hidden="true"
            className={cn("h-5 w-px shrink-0", dark ? "bg-slate-600" : "bg-slate-300")}
          />
          {customWordmark ? (
            <strong
              className={cn(
                "text-base font-extrabold tracking-tight leading-none",
                dark ? "text-white" : "text-ink-900"
              )}
            >
              {customWordmark}
            </strong>
          ) : (
            <strong
              className={cn(
                "text-lg font-extrabold tracking-tight leading-none",
                dark ? "text-white" : "text-[#015CA2]"
              )}
            >
              Jobs<span className={dark ? "text-teal-400" : "text-teal-500"}>.</span>
            </strong>
          )}
        </>
      )}
    </span>
  );
}
