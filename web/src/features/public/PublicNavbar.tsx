import { FC, useState } from "react";
import { CandidateView } from "../candidate/navigation";
import { BrandMark } from "../../shared/components/BrandMark";
import { CloseIcon, MenuIcon, NotificationIcon, ProfileIcon } from "../../shared/components/Icon";
import { BRAND_CONFIG } from "../../shared/config/brand";
import { cn } from "../../shared/ui";
import { CandidateAccountMenu } from "./CandidateAccountMenu";
import { ActiveNavTab } from "./types";

export type CandidateNavigation = {
  name: string;
  avatarUrl?: string | null;
  activeView: CandidateView;
  onNavigate: (view: CandidateView) => void;
  onLogout: () => void;
};

type Props = {
  activeTab?: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  onOpenAuth: (mode: "login" | "register") => void;
  onSearchSubmit?: (query: string) => void;
  onOpenSalaryTool?: () => void;
  candidate?: CandidateNavigation;
};

export const PublicNavbar: FC<Props> = ({
  activeTab,
  onSelectTab,
  onOpenAuth,
  candidate
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function selectTab(tab: ActiveNavTab) {
    setMobileMenuOpen(false);
    onSelectTab(tab);
  }

  return (
    <header className="portal-navbar-root sticky top-0 z-30 border-b border-border-subtle bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 min-w-0">
          <button
            type="button"
            aria-label={BRAND_CONFIG.name || "Trang chủ cổng tuyển dụng"}
            onClick={() => selectTab("home")}
            className="flex items-center text-left cursor-pointer group shrink-0 bg-transparent border-0 p-0"
          >
            <BrandMark showWordmark iconClassName="transition-transform group-hover:scale-105" />
          </button>

          <nav aria-label="Điều hướng chính" className="hidden md:flex items-center gap-1">
            <button
              type="button"
              aria-current={activeTab === "search" ? "page" : undefined}
              onClick={() => selectTab("search")}
              className={cn(
                "rounded-md px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap",
                activeTab === "search"
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
              )}
            >
              Tìm việc làm
            </button>
            <button
              type="button"
              aria-current={activeTab === "companies" ? "page" : undefined}
              onClick={() => selectTab("companies")}
              className={cn(
                "rounded-md px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap",
                activeTab === "companies"
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-ink-600 hover:bg-slate-100 hover:text-ink-900"
              )}
            >
              Công ty
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {candidate ? (
            <>
              <button
                type="button"
                aria-label="Thông báo"
                aria-current={candidate.activeView === "notifications" ? "page" : undefined}
                onClick={() => candidate.onNavigate("notifications")}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors cursor-pointer",
                  candidate.activeView === "notifications"
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-border-subtle bg-white text-ink-600 hover:bg-slate-50 hover:text-ink-900"
                )}
              >
                <NotificationIcon size={18} aria-hidden="true" />
              </button>
              <CandidateAccountMenu
                name={candidate.name}
                avatarUrl={candidate.avatarUrl}
                activeView={candidate.activeView}
                onNavigate={candidate.onNavigate}
                onLogout={candidate.onLogout}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth("register")}
                className="hidden sm:inline-flex h-9 items-center rounded-md border border-border-strong bg-white px-3.5 text-sm font-semibold text-ink-800 hover:bg-slate-50 cursor-pointer"
              >
                Tạo tài khoản
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth("login")}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-600 px-3.5 sm:px-4 text-sm font-semibold text-white shadow-xs hover:bg-brand-700 cursor-pointer"
              >
                <ProfileIcon size={16} aria-hidden="true" />
                <span>Đăng nhập</span>
              </button>
            </>
          )}

          <button
            type="button"
            aria-label={mobileMenuOpen ? "Đóng menu" : "Mở menu điều hướng"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-white text-ink-700 md:hidden cursor-pointer"
          >
            {mobileMenuOpen ? <CloseIcon size={18} /> : <MenuIcon size={18} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-border-subtle bg-white px-4 py-3 space-y-1.5 md:hidden">
          <button
            type="button"
            onClick={() => selectTab("search")}
            className="block w-full rounded-md px-3.5 py-2.5 text-left text-sm font-semibold text-ink-800 hover:bg-slate-50 cursor-pointer"
          >
            Tìm việc làm
          </button>
          <button
            type="button"
            onClick={() => selectTab("companies")}
            className="block w-full rounded-md px-3.5 py-2.5 text-left text-sm font-semibold text-ink-800 hover:bg-slate-50 cursor-pointer"
          >
            Công ty
          </button>
          {!candidate && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAuth("register");
              }}
              className="block w-full rounded-md border border-border-strong bg-white px-3.5 py-2 text-center text-sm font-semibold text-ink-800 cursor-pointer sm:hidden"
            >
              Tạo tài khoản
            </button>
          )}
        </div>
      )}
    </header>
  );
};
