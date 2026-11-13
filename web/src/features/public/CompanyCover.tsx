import { ReactNode } from "react";
import { cn } from "../../shared/ui";

type Props = {
  src: string;
  className?: string;
  children?: ReactNode;
};

export function CompanyCover({ src, className, children }: Props) {
  return (
    <div className={cn("relative overflow-hidden bg-slate-100", className)}>
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        width={1536}
        height={1024}
        loading="lazy"
        decoding="async"
        onError={(event) => {
          if (!event.currentTarget.src.endsWith("/companies/company-placeholder.svg")) {
            event.currentTarget.src = "/companies/company-placeholder.svg";
          }
        }}
      />
      {src === "/companies/company-placeholder.svg" && (
        <span className="absolute bottom-2 right-2 rounded-lg bg-slate-900/65 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
          Chưa có ảnh doanh nghiệp
        </span>
      )}
      {children}
    </div>
  );
}
