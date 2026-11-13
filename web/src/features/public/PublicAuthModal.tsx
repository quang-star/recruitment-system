import { AuthSession } from "../../shared/auth/session";
import { CloseIcon } from "../../shared/components/Icon";
import { useModalFocus } from "../../shared/components/useModalFocus";
import { setPendingJobId } from "../../shared/pendingApplication";
import { Button } from "../../shared/ui";
import { LoginPage } from "../auth/LoginPage";
import { PublicJob } from "./types";

/** Authentication & registration modal with demo account quick-fill and pending apply banner. */
export function PublicAuthModal({
  open,
  authMode,
  demoAccount,
  applyingJob,
  onClose,
  onSelectDemoAccount,
  onCancelApplyingJob,
  onLoginSuccess
}: {
  open: boolean;
  authMode: "login" | "register";
  demoAccount: { email: string; revision: number };
  applyingJob: PublicJob | null;
  onClose: () => void;
  onSelectDemoAccount: (role: "CANDIDATE" | "RECRUITER") => void;
  onCancelApplyingJob: () => void;
  onLoginSuccess: (session: AuthSession) => void;
}) {
  const authRef = useModalFocus<HTMLElement>(open, onClose);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
      role="presentation"
    >
      <section
        ref={authRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        id="auth-section"
        aria-labelledby="auth-title"
        className="relative w-full max-w-4xl rounded-3xl border border-border-subtle bg-white shadow-dialog overflow-hidden outline-none my-auto"
      >
        <button
          type="button"
          aria-label="Đóng đăng nhập"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-white text-ink-600 hover:bg-slate-100 hover:text-ink-900 cursor-pointer transition-colors"
        >
          <CloseIcon size={16} aria-hidden="true" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-12">
          <div className="md:col-span-5 bg-gradient-to-br from-brand-800 via-brand-700 to-teal-700 p-6 sm:p-8 text-white flex flex-col justify-between gap-6">
            <div className="space-y-3">
              <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-teal-200">
                HỒ SƠ & CƠ HỘI NGHỀ NGHIỆP
              </span>
              <h2 id="auth-title" className="text-2xl font-bold leading-snug tracking-tight text-white m-0">
                Bước tiếp theo cho sự nghiệp của bạn
              </h2>
              <p className="text-sm text-teal-50/90 leading-relaxed m-0">
                Đăng nhập để quản lý hồ sơ ứng viên, tải lên CV để hệ thống AI tự động trích xuất thông tin, hoặc quản lý quy trình tuyển dụng thông minh dành cho doanh nghiệp.
              </p>
            </div>

            <details className="rounded-2xl border border-white/20 bg-white/10 p-4 text-xs text-white/95">
              <summary className="cursor-pointer font-semibold select-none">
                Trải nghiệm bằng tài khoản demo
              </summary>
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <span aria-hidden="true">✨</span>
                  <span>Chọn tài khoản trình diễn</span>
                </div>
                <p className="text-teal-100/90 m-0 leading-relaxed">
                  Chọn tài khoản để điền email, sau đó nhập mật khẩu đã thiết lập khi tạo dữ liệu demo.
                </p>
                <div className="grid grid-cols-1 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onSelectDemoAccount("CANDIDATE")}
                    className="flex flex-col items-start rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-left text-white hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    <span className="font-semibold">Chọn tài khoản ứng viên</span>
                    <small className="text-teal-100">candidate.demo@smart.local</small>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectDemoAccount("RECRUITER")}
                    className="flex flex-col items-start rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-left text-white hover:bg-white/20 transition-colors cursor-pointer"
                  >
                    <span className="font-semibold">Chọn tài khoản recruiter</span>
                    <small className="text-teal-100">recruiter.demo@smart.local</small>
                  </button>
                </div>
              </div>
            </details>
          </div>

          <div className="md:col-span-7 p-6 sm:p-8 bg-white">
            {applyingJob && (
              <div
                className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-sm text-ink-800 space-y-2"
                role="status"
              >
                <strong className="block font-semibold text-brand-900">
                  Bạn đang ứng tuyển: {applyingJob.title}
                </strong>
                <p className="text-xs text-ink-600 m-0">
                  Đăng nhập tài khoản ứng viên để chọn CV và xác nhận gửi hồ sơ.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    onCancelApplyingJob();
                    setPendingJobId(null);
                  }}
                >
                  Hủy lựa chọn
                </Button>
              </div>
            )}
            <LoginPage
              key={`${demoAccount.revision}-${authMode}`}
              initialMode={authMode}
              initialEmail={demoAccount.email}
              onSuccess={onLoginSuccess}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
