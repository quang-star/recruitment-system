import { HTMLAttributes } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8"
};

/** Clean slate-bordered card surface matching the workspace & portal design system. */
export function Card({ as = "div", interactive = false, padding = "md", className, children, ...props }: CardProps) {
  const Component = as;
  return (
    <Component
      className={cn(
        "bg-surface border border-border-subtle rounded-2xl shadow-card",
        interactive && "transition-all duration-150 hover:shadow-card-hover hover:border-brand-300",
        paddingMap[padding],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-start justify-between gap-4 pb-4 border-b border-border-subtle/80", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-base font-bold text-ink-900 tracking-tight m-0", className)} {...props}>
      {children}
    </h2>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-ink-500 mt-1 mb-0 leading-relaxed", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("pt-4", className)} {...props}>
      {children}
    </div>
  );
}
