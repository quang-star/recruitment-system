import { ReactNode } from "react";
import { LogoutIcon, SparklesIcon } from "../components/Icon";
import { BRAND_CONFIG } from "../config/brand";

export type WorkspaceNavItem<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
};

type WorkspaceShellProps<T extends string> = {
  activeItem: T;
  brandLabel: string;
  children: ReactNode;
  eyebrow: string;
  navItems: WorkspaceNavItem<T>[];
  onLogout: () => void;
  onNavigate: (item: T) => void;
  title: string;
  userLabel: string;
  variant: "candidate" | "recruiter";
};

export function WorkspaceShell<T extends string>({
  activeItem,
  brandLabel,
  children,
  eyebrow,
  navItems,
  onLogout,
  onNavigate,
  title,
  userLabel,
  variant
}: WorkspaceShellProps<T>) {
  if (variant === "candidate") {
    return (
      <div className="candidate-portal-layout">
        <header className="candidate-top-header" aria-label="Điều hướng chính">
          <div className="candidate-header-inner">
            <div className="candidate-brand">
              <span className="brand-mark">
                <SparklesIcon size={18} />
              </span>
              <div className="brand-text">
                <strong>{BRAND_CONFIG.name || BRAND_CONFIG.defaultCandidateLabel}</strong>
                {BRAND_CONFIG.name ? <span className="candidate-badge">ỨNG VIÊN</span> : null}
              </div>
            </div>

            <nav className="candidate-nav">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`candidate-nav-btn ${item.id === activeItem ? "active" : ""}`}
                  aria-current={item.id === activeItem ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="candidate-header-right">
              <div className="user-chip">
                <span className="user-avatar">{userLabel.slice(0, 1).toUpperCase()}</span>
                <div className="user-meta">
                  <strong>{userLabel}</strong>
                  <small className="user-status-text">Đã đăng nhập</small>
                </div>
              </div>
              <button className="candidate-logout-btn" type="button" onClick={onLogout}>
                <span aria-hidden="true"><LogoutIcon size={16} /></span>
                <span>Đăng xuất</span>
              </button>
            </div>
          </div>
        </header>

        <main className="candidate-main-content">
          <div className="candidate-content-wrapper">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <section className="app-workspace recruiter-app">
      <aside className="app-sidebar" aria-label="Điều hướng chính">
        <div className="app-brand">
          <span className="brand-mark">
            <SparklesIcon size={18} />
          </span>
          <div className="brand-info">
            <strong>{BRAND_CONFIG.name || BRAND_CONFIG.defaultRecruiterLabel}</strong>
            <small>{brandLabel}</small>
          </div>
        </div>
        <nav className="workspace-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeItem ? "active" : ""}
              aria-current={item.id === activeItem ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <button className="sidebar-logout" type="button" onClick={onLogout}>
          <span aria-hidden="true"><LogoutIcon size={16} /></span>
          <span>Đăng xuất</span>
        </button>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-title-block">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <div className="portal-badge">{brandLabel}</div>
            <div className="user-chip">
              <span className="user-avatar">{userLabel.slice(0, 1).toUpperCase()}</span>
              <div className="user-meta">
                <strong>{userLabel}</strong>
                <small className="user-status-text">Đã đăng nhập</small>
              </div>
            </div>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </section>
  );
}
