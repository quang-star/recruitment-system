import { useEffect, useState } from "react";
import { cn } from "../../shared/ui";

const MONOGRAM_PALETTES = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-amber-50 text-amber-800 border-amber-200",
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-orange-50 text-orange-700 border-orange-200",
  "bg-slate-100 text-slate-700 border-slate-300"
] as const;

const LEGAL_PREFIX_RE =
  /^(công\s+ty\s+(tnhh\s+mtv|tnhh|cổ\s+phần|cp|mtv)?|cty\s+(tnhh|cp)?|tập\s+đoàn|chi\s+nhánh|tnhh|cổ\s+phần)\s+/i;

function getCompanyInitials(name?: string): string {
  let cleaned = (name ?? "").trim();
  if (!cleaned) return "DN";
  // Strip repeated Vietnamese legal prefixes (e.g. "Công ty TNHH MTV ")
  let prev = "";
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(LEGAL_PREFIX_RE, "").trim();
  }
  const target = cleaned || (name ?? "").trim();
  const words = target.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

function getPaletteIndex(name?: string): number {
  const text = (name ?? "").trim();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % MONOGRAM_PALETTES.length;
}

type CompanyLogoProps = {
  src?: string | null;
  name?: string;
  alt?: string;
  className?: string;
  textClassName?: string;
};

/** Renders a company's real logo when available, or a deterministic corporate monogram instead of a generic placeholder. */
export function CompanyLogo({
  src,
  name,
  alt = "",
  className = "h-12 w-12 rounded-lg",
  textClassName = "text-xs font-bold tracking-tight"
}: CompanyLogoProps) {
  const normalizedSrc = src?.trim() || "";
  const isGenericFallback = !normalizedSrc || normalizedSrc === "/logos/smartrecruitment.svg";
  const [failed, setFailed] = useState(isGenericFallback);

  useEffect(() => {
    setFailed(isGenericFallback);
  }, [isGenericFallback, normalizedSrc]);

  if (failed) {
    const palette = MONOGRAM_PALETTES[getPaletteIndex(name)];
    return (
      <span
        aria-hidden={alt === "" ? true : undefined}
        aria-label={alt || undefined}
        className={cn(
          "inline-flex shrink-0 items-center justify-center border select-none",
          palette,
          className,
          textClassName
        )}
      >
        {getCompanyInitials(name)}
      </span>
    );
  }

  return (
    <img
      src={normalizedSrc}
      alt={alt}
      onError={() => setFailed(true)}
      className={cn(
        "shrink-0 border border-border-subtle bg-white object-contain p-1.5",
        className
      )}
    />
  );
}
