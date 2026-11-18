import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, CloseIcon, LogoutIcon, MenuIcon, ProfileIcon } from "../components/Icon";
import { BRAND_CONFIG } from "../config/brand";
import { cn } from "../ui";

export type WorkspaceNavItem<T extends string> = {
  id: T;
  label: string;
  icon: ReactNode;
  badge?: number;
};

export type WorkspaceAccountMenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  onSelect: () => void;
};

type WorkspaceShellProps<T extends string> = {
  activeItem: T;
  brandLabel: string;
  children: ReactNode;
  eyebrow?: string;
  navItems: WorkspaceNavItem<T>[];
  onLogout: () => void;
  onNavigate: (item: T) => void;
  title?: string;
  userLabel: string;
  accountRoleLabel?: string;
  accountMenuItems?: WorkspaceAccountMenuItem[];
  variant: "candidate" | "recruiter";
  headerActions?: ReactNode;
  hideDefaultAccountControls?: boolean;
  onBrandClick?: () => void;
};

function SidebarAccountMenu({
  userLabel,
  accountRoleLabel,
  accountMenuItems,
  onLogout
}: {
  userLabel: string;
  accountRoleLabel?: string;
  accountMenuItems?: WorkspaceAccountMenuItem[];
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const initial = (userLabel.trim().slice(0, 1) || "U").toUpperCase();
  const hasMenuItems = Boolean(accountMenuItems && accountMenuItems.length > 0);

  return (
    <div
      ref={rootRef}
      className="pt-3 mt-3 border-t border-border-subtle relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left cursor-pointer",
          open
            ? "bg-brand-50 text-brand-700 font-semibold"
            : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
        )}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className={cn("shrink-0", open ? "text-brand-600" : "text-ink-400")} aria-hidden="true">
            <ProfileIcon size={18} />
          </span>
          <span className="truncate">Tài khoản</span>
        </span>
        <ChevronDownIcon
          size={16}
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", open ? "rotate-180 text-brand-600" : "text-ink-400")}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-border-subtle bg-white p-1.5 shadow-dialog z-50"
        >
          <div className="flex items-center gap-2.5 px-2.5 py-2 border-b border-border-subtle mb-1">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
            >
              {initial}
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-sm font-bold text-ink-900">{userLabel}</strong>
              {accountRoleLabel && (
                <span className="block truncate text-xs text-ink-500">{accountRoleLabel}</span>
              )}
            </div>
          </div>

          {hasMenuItems && (
            <nav aria-label="Menu tài khoản" className="space-y-0.5">
              {accountMenuItems!.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={item.active ? "page" : undefined}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors cursor-pointer text-left",
                    item.active ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink-700 hover:bg-slate-50"
                  )}
                >
                  <span className={cn("shrink-0", item.active ? "text-brand-600" : "text-ink-400")} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </nav>
          )}

          <div className={cn(hasMenuItems && "mt-1 pt-1 border-t border-border-subtle")}>
            <button
              type="button"
              onClick={() => {
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

/** Unified application frame for Candidate top-bar portal and Recruiter/Admin sidebar workspaces. */
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
  accountRoleLabel,
  accountMenuItems,
  variant,
  headerActions,
  hideDefaultAccountControls = false,
  onBrandClick
}: WorkspaceShellProps<T>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const displayBrand = BRAND_CONFIG.name || brandLabel;

  function selectItem(id: T) {
    setMobileMenuOpen(false);
    onNavigate(id);
  }

  if (variant === "candidate") {
    return (
      <div className="min-h-screen flex flex-col bg-canvas text-ink-900">
        <header className="sticky top-0 z-30 border-b border-border-subtle bg-white/95 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            {onBrandClick ? (
              <button
                type="button"
                aria-label={displayBrand || "Trang chủ"}
                onClick={onBrandClick}
                className="flex items-center gap-3 min-w-0 bg-transparent border-0 p-0 cursor-pointer text-left"
              >
                <img src="/logo.png" alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" />
                {displayBrand && (
                  <span className="truncate text-base font-bold tracking-tight text-ink-900">
                    {displayBrand}
                  </span>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <img src="/logo.png" alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" />
                {displayBrand && (
                  <span className="truncate text-base font-bold tracking-tight text-ink-900">
                    {displayBrand}
                  </span>
                )}
              </div>
            )}

            <nav aria-label="Điều hướng chính" className="hidden md:flex items-center gap-1 overflow-x-auto">
              {navItems.map((item) => {
                const active = activeItem === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => selectItem(item.id)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer",
                      active
                        ? "bg-brand-50 text-brand-700 font-semibold"
                        : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
                    )}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-xs font-bold text-white leading-none">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {headerActions}
              {!hideDefaultAccountControls && (
                <>
                  <span className="hidden sm:inline-flex items-center rounded-full border border-border-subtle bg-slate-50 px-3 py-1.5 text-sm font-semibold text-ink-700">
                    {userLabel}
                  </span>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-slate-50 hover:text-ink-900 cursor-pointer"
                  >
                    <LogoutIcon size={15} />
                    <span>Đăng xuất</span>
                  </button>
                </>
              )}
              <button
                type="button"
                aria-label={mobileMenuOpen ? "Đóng menu" : "Mở menu điều hướng"}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-white text-ink-700 md:hidden cursor-pointer"
              >
                {mobileMenuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div className="border-t border-border-subtle bg-white px-4 py-3 space-y-1 md:hidden">
              {navItems.map((item) => {
                const active = activeItem === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => selectItem(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium cursor-pointer",
                      active ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink-700 hover:bg-slate-50"
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      {item.icon}
                      <span>{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
              <div className="pt-2 mt-2 border-t border-border-subtle flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-600">{userLabel}</span>
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold text-ink-700 cursor-pointer"
                >
                  <LogoutIcon size={14} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </div>
          )}
        </header>

        <div className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {(eyebrow || title) && (
            <div className="mb-6 flex flex-col gap-2 pb-5 border-b border-border-subtle sm:flex-row sm:items-end sm:justify-between">
              <div>
                {eyebrow && (
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0 mb-1">{eyebrow}</p>
                )}
                {title && <h1 className="text-2xl font-bold tracking-tight text-ink-900 m-0">{title}</h1>}
              </div>
            </div>
          )}
          <div className="space-y-6">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-w-[1024px] flex bg-canvas text-ink-900">
      <aside
        aria-label="Điều hướng không gian làm việc"
        className="sticky top-0 h-screen w-64 shrink-0 border-r border-border-subtle bg-white flex flex-col justify-between p-4"
      >
        <div className="space-y-6 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-3 min-w-0">
              <img src="/logo.png" alt="" aria-hidden="true" className="h-9 w-9 shrink-0 object-contain" />
              <div className="min-w-0">
                {BRAND_CONFIG.name ? (
                  <>
                    <strong className="block truncate text-sm font-bold text-ink-900">{BRAND_CONFIG.name}</strong>
                    <span className="block truncate text-xs text-ink-500">{brandLabel}</span>
                  </>
                ) : (
                  <strong className="block truncate text-sm font-bold text-ink-900">{brandLabel || eyebrow}</strong>
                )}
              </div>
            </div>
          </div>

          <nav aria-label="Điều hướng chức năng" className="space-y-1">
            {navItems.map((item) => {
              const active = activeItem === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectItem(item.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors text-left cursor-pointer",
                    active
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
                  )}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={cn("shrink-0", active ? "text-brand-600" : "text-ink-400")}>{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white leading-none">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <SidebarAccountMenu
          userLabel={userLabel}
          accountRoleLabel={accountRoleLabel}
          accountMenuItems={accountMenuItems}
          onLogout={onLogout}
        />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex-1 mx-auto w-full max-w-7xl px-8 py-6 space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}
