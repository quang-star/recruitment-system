import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white border border-brand-600 shadow-xs hover:bg-brand-700 hover:border-brand-700 active:bg-brand-800 disabled:bg-brand-600/50 disabled:border-brand-600/30",
  secondary:
    "bg-white text-ink-800 border border-border-strong shadow-xs hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 disabled:bg-slate-50 disabled:text-ink-400",
  subtle:
    "bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 hover:border-brand-300 disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-700 border border-transparent hover:bg-slate-100 hover:text-ink-900 disabled:text-ink-400",
  danger:
    "bg-rose-600 text-white border border-rose-600 shadow-xs hover:bg-rose-700 hover:border-rose-700 disabled:bg-rose-400"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs font-medium rounded-md gap-1.5",
  md: "h-10 px-4 text-sm font-semibold rounded-lg gap-2",
  lg: "h-11 px-5 text-sm font-semibold rounded-lg gap-2"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/** Standard accessible action button shared across public portal and role workspaces. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, disabled, className, type = "button", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed select-none",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});
