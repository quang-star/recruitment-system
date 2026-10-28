import { ReactNode } from "react";

type Props = {
  src: string;
  className: string;
  children?: ReactNode;
};

export function CompanyCover({ src, className, children }: Props) {
  return (
    <div className={`company-artwork ${className}`}>
      <img
        src={src}
        alt=""
        className="company-cover-img"
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
      <span className="company-artwork-caption">Ảnh tham khảo</span>
      {children}
    </div>
  );
}
