import { ReactNode, useEffect, useState } from "react";
import { cn } from "../../shared/ui";

const COVER_SURFACES = [
  "bg-slate-800",
  "bg-blue-900",
  "bg-emerald-900",
  "bg-sky-900",
  "bg-teal-900",
  "bg-slate-900",
  "bg-zinc-800",
  "bg-amber-900"
] as const;

function getCoverSurface(name?: string): string {
  const text = (name ?? "").trim();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return COVER_SURFACES[hash % COVER_SURFACES.length];
}

type Props = {
  src?: string | null;
  name?: string;
  className?: string;
  children?: ReactNode;
};

export function CompanyCover({ src, name, className, children }: Props) {
  const normalizedSrc = src?.trim() || "";
  const isGenericFallback =
    !normalizedSrc || normalizedSrc === "/companies/company-placeholder.svg";
  const [failed, setFailed] = useState(isGenericFallback);

  useEffect(() => {
    setFailed(isGenericFallback);
  }, [isGenericFallback, normalizedSrc]);

  return (
    <div className={cn("relative overflow-hidden bg-slate-100", className)}>
      {failed ? (
        <div
          aria-hidden="true"
          className={cn("relative h-full w-full", getCoverSurface(name))}
        >
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.45)_1px,transparent_0)] [background-size:20px_20px]" />
        </div>
      ) : (
        <img
          src={normalizedSrc}
          alt=""
          className="h-full w-full object-cover"
          width={1536}
          height={1024}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      {children}
    </div>
  );
}
