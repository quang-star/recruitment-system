import { useEffect, useId, useRef, useState } from "react";
import { CvIcon, DashboardIcon, JobsIcon, LogoutIcon, ProfileIcon, SecurityIcon } from "../../shared/components/Icon";
import { candidateAccountLinks, CandidateAccountView, CandidateView } from "../candidate/navigation";
import "./candidatePortal.css";

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

  useEffect(() => {
    return () => clearLeaveTimer();
  }, []);

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
      className="portal-account"
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
        className="portal-account-trigger"
        aria-label={`Tài khoản ${name}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          clearLeaveTimer();
          setOpen((value) => !value);
        }}
      >
        <span className="portal-account-avatar" aria-hidden="true">
          {name.trim().slice(0, 1).toUpperCase()}
        </span>
        <span className="portal-account-name">{name}</span>
        <span className="portal-account-chevron" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div id={panelId} className="portal-account-dropdown">
          <div className="portal-account-summary">
            <strong>{name}</strong>
            <span>Tài khoản ứng viên</span>
          </div>
          <nav aria-label="Tài khoản cá nhân">
            {candidateAccountLinks.map((item) => {
              const Icon = icons[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={activeView === item.id ? "page" : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <span className="dropdown-item-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="dropdown-item-label">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            className="portal-account-logout"
            onClick={() => {
              clearLeaveTimer();
              setOpen(false);
              onLogout();
            }}
          >
            <span className="dropdown-item-icon" aria-hidden="true">
              <LogoutIcon size={18} />
            </span>
            <span className="dropdown-item-label">Đăng xuất</span>
          </button>
        </div>
      )}
    </div>
  );
}
