import { ReactNode } from "react";

export type WorkspaceNavItem<T extends string> = {
  id: T;
  label: string;
  icon: string;
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
  return (
    <section className={`app-workspace ${variant}-app`}>
      <aside className="app-sidebar" aria-label="Điều hướng chính">
        <div className="app-brand"><span className="brand-mark">SR</span><span><strong>SmartRecruit</strong><small>{brandLabel}</small></span></div>
        <nav className="workspace-nav">
          {navItems.map((item) => (
            <button key={item.id} type="button" className={item.id === activeItem ? "active" : ""}
              aria-current={item.id === activeItem ? "page" : undefined} onClick={() => onNavigate(item.id)}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <button className="sidebar-logout" type="button" onClick={onLogout}>↪ Đăng xuất</button>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
          <div className="user-chip"><span className="user-avatar">{userLabel.slice(0, 1).toUpperCase()}</span><span><strong>{userLabel}</strong><small>Đã xác thực</small></span></div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </section>
  );
}
