import { useEffect, useId, useRef, useState } from "react";
import { CvIcon, DashboardIcon, JobsIcon, LogoutIcon, ProfileIcon, SecurityIcon } from "../../shared/components/Icon";
import { cn } from "../../shared/ui";
import { candidateAccountLinks, CandidateAccountView, CandidateView } from "../candidate/navigation";

type Props = {
  name: string;
  activeView?: CandidateView;
  onNavigate: (view: CandidateView) => void;
  onLogout: () => void;
};

const icons = { dashboard: DashboardIcon, profile: ProfileIcon, cv: CvIcon, applications: JobsIcon, security: SecurityIcon };

export function CandidateAccountMenu({ name, activeView, onNavigate, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  function clearLeaveTimer() {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function handleMouseEnter() {
    clearLeaveTimer();
    setOpen(true);
  }

  function handleMouseLeave() {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => {
      setOpen(false);
      leaveTimer.current = null;
    }, 200);
  }

  useEffect(() => () => clearLeaveTimer(), []);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function navigate(view: CandidateAccountView) {
    clearLeaveTimer();
    setOpen(false);
    onNavigate(view);
    trigger.current?.focus();
  }

  return (
    <div
      className="portal-account relative"
      ref={root}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          clearLeaveTimer();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        aria-label={`Tài khoản ${name}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          clearLeaveTimer();
          setOpen((value) => !value);
        }}
        className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-slate-50 px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-ink-800 hover:border-brand-300 hover:bg-white transition-colors cursor-pointer"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
        >
          {name.trim().slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[130px] truncate">{name}</span>
        <span aria-hidden="true" className="text-ink-400 text-xs">⌄</span>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 mt-2 w-60 rounded-2xl border border-border-subtle bg-white p-1.5 shadow-dialog z-50"
        >
          <div className="px-3 py-2.5 border-b border-border-subtle mb-1">
            <strong className="block truncate text-sm font-bold text-ink-900">{name}</strong>
            <span className="block text-xs text-ink-500">Tài khoản ứng viên</span>
          </div>
          <nav aria-label="Tài khoản cá nhân" className="space-y-0.5">
            {candidateAccountLinks.map((item) => {
              const Icon = icons[item.id];
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer text-left",
                    active ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink-700 hover:bg-slate-50"
                  )}
                >
                  <span className={cn("shrink-0", active ? "text-brand-600" : "text-ink-400")} aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-1 pt-1 border-t border-border-subtle">
            <button
              type="button"
              onClick={() => {
                clearLeaveTimer();
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer text-left"
            >
              <span aria-hidden="true">
                <LogoutIcon size={16} />
              </span>
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
