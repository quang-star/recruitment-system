import { FC, useState } from "react";
import { ProfileIcon, CompanyIcon, SearchIcon, NotificationIcon } from "../../shared/components/Icon";
import { ActiveNavTab } from "./types";
import { BRAND_CONFIG } from "../../shared/config/brand";
import { CandidateAccountMenu } from "./CandidateAccountMenu";
import { CandidateView } from "../candidate/navigation";
import "./candidatePortal.css";

export type CandidateNavigation = {
  name: string;
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
  onSearchSubmit,
  onOpenSalaryTool,
  candidate,
}) => {
  const [navSearch, setNavSearch] = useState("");

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      onSelectTab("search");
      onSearchSubmit?.(navSearch);
    }
  }

  return (
    <header className="portal-navbar-root portal-navbar-single">
      <div className="portal-container navbar-single-inner">
        {/* Left: Brand Logo + Primary Nav Links */}
        <div className="navbar-left-group">
          <button
            type="button"
            className="portal-brand-logo"
            onClick={() => onSelectTab("home")}
          >
            <span className="brand-logo-text">{BRAND_CONFIG.name || BRAND_CONFIG.defaultPortalLabel}</span>
            {BRAND_CONFIG.tagline ? <span className="brand-tag-smart">{BRAND_CONFIG.tagline}</span> : null}
          </button>

          <nav className="navbar-main-nav" aria-label="Điều hướng chính">
            <button
              type="button"
              className={`nav-link-btn ${activeTab === "home" ? "active" : ""}`}
              aria-current={activeTab === "home" ? "page" : undefined}
              onClick={() => onSelectTab("home")}
            >
              Trang chủ
            </button>
            <button
              type="button"
              className={`nav-link-btn ${activeTab === "search" ? "active" : ""}`}
              aria-current={activeTab === "search" ? "page" : undefined}
              onClick={() => onSelectTab("search")}
            >
              Tìm việc làm
            </button>
            <button
              type="button"
              className={`nav-link-btn ${activeTab === "companies" ? "active" : ""}`}
              aria-current={activeTab === "companies" ? "page" : undefined}
              onClick={() => onSelectTab("companies")}
            >
              Công ty
            </button>
            {onOpenSalaryTool && (
              <button
                type="button"
                className="nav-link-btn"
                onClick={onOpenSalaryTool}
              >
                Tính lương Gross–Net
              </button>
            )}
            <button
              type="button"
              className="nav-link-btn nav-link-ai"
              onClick={() => {
                const aiSec = document.getElementById("ai-matching-section");
                if (aiSec) {
                  aiSec.scrollIntoView({ behavior: "smooth" });
                } else {
                  onSelectTab("home");
                  setTimeout(() => {
                    document.getElementById("ai-matching-section")?.scrollIntoView({ behavior: "smooth" });
                  }, 120);
                }
              }}
            >
              <span className="ai-nav-sparkle" aria-hidden="true">✨</span> Công nghệ AI
            </button>
          </nav>
        </div>

        {/* Center Search Pill (when not on home/search or needed) */}
        {activeTab !== "search" && activeTab !== "home" ? (
          <div className="portal-nav-pill-search">
            <input
              type="text"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Vị trí tuyển dụng, kỹ năng, công ty..."
              aria-label="Tìm kiếm trên thanh điều hướng"
            />
            <button
              type="button"
              className="pill-search-icon-btn"
              aria-label="Tìm kiếm"
              onClick={() => {
                onSelectTab("search");
                onSearchSubmit?.(navSearch);
              }}
            >
              <SearchIcon aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {/* Right utility actions */}
        <div className="portal-nav-right-actions">
          {candidate ? (
            <>
              <button
                type="button"
                className={`portal-notification-button ${candidate.activeView === "notifications" ? "active" : ""}`}
                aria-label="Thông báo"
                title="Thông báo"
                aria-current={candidate.activeView === "notifications" ? "page" : undefined}
                onClick={() => candidate.onNavigate("notifications")}
              >
                <NotificationIcon size={21} aria-hidden="true" />
              </button>
              <CandidateAccountMenu
                name={candidate.name}
                activeView={candidate.activeView}
                onNavigate={candidate.onNavigate}
                onLogout={candidate.onLogout}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                className="portal-login-text-btn employer-entry"
                onClick={() => onOpenAuth("login")}
              >
                <CompanyIcon size={17} aria-hidden="true" /> Nhà tuyển dụng
              </button>
              <button
                type="button"
                className="portal-register-btn"
                onClick={() => onOpenAuth("register")}
              >
                Tạo tài khoản
              </button>
              <button
                type="button"
                className="portal-login-text-btn"
                onClick={() => onOpenAuth("login")}
              >
                <ProfileIcon size={17} aria-hidden="true" /> Đăng nhập
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
