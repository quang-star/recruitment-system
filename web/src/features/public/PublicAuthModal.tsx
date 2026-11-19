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
  initialAccountType = "CANDIDATE",
  demoAccount,
  applyingJob,
  onClose,
  onSelectDemoAccount,
  onCancelApplyingJob,
  onLoginSuccess
}: {
  open: boolean;
  authMode: "login" | "register";
  initialAccountType?: "CANDIDATE" | "RECRUITER";
  demoAccount: { email: string; revision: number };
  applyingJob: PublicJob | null;
  onClose: () => void;
  onSelectDemoAccount: (role: "CANDIDATE" | "RECRUITER") => void;
  onCancelApplyingJob: () => void;
  onLoginSuccess: (session: AuthSession) => void;
}) {
  const authRef = useModalFocus<HTMLElement>(open, onClose);
  if (!open) return null;

  const modalTitle = authMode === "register" ? "Tạo tài khoản" : "Đăng nhập";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto"
      role="presentation"
    >
      <section
        ref={authRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        id="auth-section"
        aria-labelledby="auth-title"
        className="relative w-full max-w-lg rounded-lg border border-border-subtle bg-white shadow-dialog p-6 sm:p-8 outline-none my-auto"
      >
        <h2 id="auth-title" className="sr-only">
          {modalTitle}
        </h2>

        <button
          type="button"
          aria-label="Đóng đăng nhập"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-subtle bg-white text-ink-600 hover:bg-slate-100 hover:text-ink-900 cursor-pointer transition-colors"
        >
          <CloseIcon size={16} aria-hidden="true" />
        </button>

        {applyingJob && (
          <div
            className="mb-5 mr-10 rounded-lg border border-brand-200 bg-brand-50 p-3.5 text-sm text-ink-800 space-y-2"
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
          key={`${demoAccount.revision}-${authMode}-${initialAccountType}`}
          initialMode={authMode}
          initialEmail={demoAccount.email}
          initialAccountType={initialAccountType}
          onSuccess={onLoginSuccess}
        />

        <details className="mt-5 border-t border-border-subtle pt-4 text-xs text-ink-700">
          <summary className="cursor-pointer font-semibold text-ink-700 hover:text-ink-900 select-none">
            Dùng tài khoản demo local
          </summary>
          <div className="mt-3 space-y-2.5">
            <p className="text-ink-600 m-0 leading-relaxed">
              Chọn tài khoản để điền sẵn email, sau đó nhập mật khẩu đã thiết lập trong môi trường demo.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSelectDemoAccount("CANDIDATE")}
                className="flex flex-col items-start rounded-md border border-border-subtle bg-slate-50 px-3 py-2 text-left text-ink-900 hover:border-brand-300 hover:bg-brand-50/60 transition-colors cursor-pointer"
              >
                <span className="font-semibold">Chọn tài khoản ứng viên</span>
                <small className="text-ink-500">candidate.demo@smart.local</small>
              </button>
              <button
                type="button"
                onClick={() => onSelectDemoAccount("RECRUITER")}
                className="flex flex-col items-start rounded-md border border-border-subtle bg-slate-50 px-3 py-2 text-left text-ink-900 hover:border-brand-300 hover:bg-brand-50/60 transition-colors cursor-pointer"
              >
                <span className="font-semibold">Chọn tài khoản recruiter</span>
                <small className="text-ink-500">recruiter.demo@smart.local</small>
              </button>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
