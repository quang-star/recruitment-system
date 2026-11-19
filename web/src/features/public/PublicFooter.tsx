import { BrandMark } from "../../shared/components/BrandMark";
import { BRAND_CONFIG } from "../../shared/config/brand";
import { CandidateNavigation } from "./PublicNavbar";

/** Global footer for the public recruitment portal with candidate, recruiter, and account links. */
export function PublicFooter({
  candidate,
  onOpenSearch,
  onOpenCompanies,
  onOpenAuth
}: {
  candidate?: CandidateNavigation;
  onOpenSearch: () => void;
  onOpenCompanies: () => void;
  onOpenAuth: (mode?: "login" | "register", accountType?: "CANDIDATE" | "RECRUITER") => void;
}) {
  const linkClass =
    "text-slate-300 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer text-left";

  return (
    <footer className="border-t border-slate-800 bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <BrandMark
              size="sm"
              showWordmark
              dark
              wordmark={BRAND_CONFIG.name || BRAND_CONFIG.defaultPortalLabel || undefined}
            />
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed m-0">
              Nền tảng tìm việc, quản lý CV và hỗ trợ đối chiếu hồ sơ tuyển dụng.
            </p>
            <div className="text-xs text-slate-500 pt-1">
              © 2026 Smart Recruitment. Tất cả quyền được bảo lưu.
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white m-0">Dành cho ứng viên</h4>
            <ul className="space-y-2 list-none p-0 m-0 text-sm">
              <li>
                <button type="button" onClick={onOpenSearch} className={linkClass}>
                  Tìm việc làm IT
                </button>
              </li>
              <li>
                <button type="button" onClick={onOpenCompanies} className={linkClass}>
                  Danh sách doanh nghiệp
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => (candidate ? candidate.onNavigate("cv") : onOpenAuth("login", "CANDIDATE"))}
                  className={linkClass}
                >
                  Tải lên CV ứng tuyển
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => (candidate ? candidate.onNavigate("profile") : onOpenAuth("login", "CANDIDATE"))}
                  className={linkClass}
                >
                  Tạo hồ sơ chuyên nghiệp
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white m-0">Dành cho nhà tuyển dụng</h4>
            <ul className="space-y-2 list-none p-0 m-0 text-sm">
              <li>
                <button type="button" onClick={() => onOpenAuth("register", "RECRUITER")} className={linkClass}>
                  Đăng tin tuyển dụng
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onOpenAuth("login", "RECRUITER")} className={linkClass}>
                  Quản lý ứng viên
                </button>
              </li>
              <li>
                <button type="button" onClick={onOpenCompanies} className={linkClass}>
                  Hồ sơ doanh nghiệp
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white m-0">Quản lý tài khoản</h4>
            <ul className="space-y-2 list-none p-0 m-0 text-sm">
              {candidate ? (
                <>
                  <li>
                    <button type="button" onClick={() => candidate.onNavigate("profile")} className={linkClass}>
                      Hồ sơ cá nhân
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => candidate.onNavigate("security")} className={linkClass}>
                      Bảo mật tài khoản
                    </button>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button type="button" onClick={() => onOpenAuth("register")} className={linkClass}>
                      Tạo tài khoản
                    </button>
                  </li>
                  <li>
                    <button type="button" onClick={() => onOpenAuth()} className={linkClass}>
                      Đăng nhập & khôi phục tài khoản
                    </button>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
