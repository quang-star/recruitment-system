import { ReactNode, useId } from "react";
import { useModalFocus } from "../components/useModalFocus";
import { cn } from "./cn";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-6xl h-[88vh]"
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  description?: string;
  size?: ModalSize;
  closeDisabled?: boolean;
  closeLabel?: string;
  className?: string;
  titleId?: string;
  children: ReactNode;
};

/** Accessible dialog wrapper with Escape handling, focus trap, and backdrop dismissal. */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  size = "md",
  closeDisabled = false,
  closeLabel = "Đóng",
  className,
  titleId: providedTitleId,
  children
}: ModalProps) {
  const generatedId = useId();
  const titleId = providedTitleId ?? generatedId;
  const handleClose = () => {
    if (!closeDisabled) onClose();
  };
  const dialogRef = useModalFocus<HTMLElement>(open, handleClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-4 overflow-y-auto"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "relative w-full bg-surface border border-border-subtle rounded-2xl shadow-dialog p-6 text-ink-900 outline-none flex flex-col max-h-[90vh]",
          sizeClasses[size],
          className
        )}
      >
        {(title || eyebrow) && (
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-border-subtle shrink-0">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0 mb-1">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2 id={titleId} className="text-lg font-bold text-ink-900 m-0 leading-snug">
                  {title}
                </h2>
              )}
              {description && <p className="text-sm text-ink-500 mt-1 mb-0">{description}</p>}
            </div>
            <button
              type="button"
              aria-label={closeLabel}
              disabled={closeDisabled}
              onClick={handleClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-slate-50 text-ink-700 hover:bg-slate-100 hover:text-ink-900 disabled:opacity-50 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}
