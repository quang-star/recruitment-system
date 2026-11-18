import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { PublicHomePage } from "./features/public/PublicHomePage";
import { apiRequest } from "./shared/api/client";
import {
  AuthSession,
  clearSession,
  loadSession,
  sessionGeneration,
  subscribeSession,
  updateSession
} from "./shared/auth/session";
import { EnsureRouter, routes } from "./shared/router";
import { Button, ErrorBanner } from "./shared/ui";

const CandidateProfilePage = lazy(() =>
  import("./features/candidate/CandidateProfilePage").then((m) => ({ default: m.CandidateProfilePage }))
);
const RecruiterWorkspace = lazy(() =>
  import("./features/recruiter/RecruiterWorkspace").then((m) => ({ default: m.RecruiterWorkspace }))
);
const AdminWorkspace = lazy(() =>
  import("./features/admin/AdminWorkspace").then((m) => ({ default: m.AdminWorkspace }))
);
const AcceptCompanyInvitationPage = lazy(() =>
  import("./features/recruiter/AcceptCompanyInvitationPage").then((m) => ({ default: m.AcceptCompanyInvitationPage }))
);
const VerifyEmailPage = lazy(() =>
  import("./features/auth/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage }))
);
const ResetPasswordPage = lazy(() =>
  import("./features/auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))
);

type CurrentUser = {
  userId: string;
  email?: string;
  status: string;
  emailVerified: boolean;
  roles: string[];
  hasPassword?: boolean;
  googleLinked?: boolean;
};

function WorkspaceLoadingFallback({ message = "Đang tải không gian làm việc…" }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <p className="text-sm font-medium text-ink-600 m-0">{message}</p>
      </div>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [sessionVerified, setSessionVerified] = useState(() => loadSession() === null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const sessionEpoch = sessionGeneration();
  const observedEpoch = useRef(sessionEpoch);

  useEffect(() => subscribeSession(() => {
    const current = loadSession();
    if (observedEpoch.current !== sessionGeneration()) {
      observedEpoch.current = sessionGeneration();
      setSessionVerified(current === null);
    }
    setSession(current);
    if (!current) { setSessionVerified(true); setVerificationError(null); }
  }), []);

  useEffect(() => {
    if (!session) { setSessionVerified(true); return; }
    let active = true;
    setSessionVerified(false);
    setVerificationError(null);
    const generation = sessionGeneration();
    void apiRequest<CurrentUser>("/api/v2/auth/me", { accessToken: session.accessToken })
      .then((currentUser) => {
        if (!active) return;
        const latest = loadSession();
        if (!latest || generation !== sessionGeneration()) return;
        if (currentUser.userId !== latest.userId) throw new Error("Unexpected current user");
        const verified: AuthSession = {
          ...latest,
          roles: currentUser.roles,
          ...(typeof currentUser.email === "string" ? { email: currentUser.email } : {}),
          ...(typeof currentUser.hasPassword === "boolean" ? { hasPassword: currentUser.hasPassword } : {}),
          ...(typeof currentUser.googleLinked === "boolean" ? { googleLinked: currentUser.googleLinked } : {})
        };
        if (!updateSession(verified, latest.refreshToken, generation)) return;
        setSessionVerified(true);
      })
      .catch(() => {
        if (!active) return;
        if (!loadSession()) { setSession(null); setSessionVerified(true); }
        else setVerificationError("Chưa thể xác minh phiên đăng nhập. Phiên được giữ lại; vui lòng thử lại khi kết nối ổn định.");
      });
    return () => { active = false; };
  }, [session?.userId, sessionEpoch, verificationAttempt]);

  const logout = useCallback(async () => {
    const shouldReturnHome = /^\/(candidate|recruiter|admin|accept-invitation)(\/|$)/.test(pathnameRef.current);
    const current = loadSession();
    clearSession();
    setSession(null);
    if (shouldReturnHome) {
      navigate(routes.home, { replace: true });
    }
    try {
      if (current?.refreshToken) {
        await apiRequest<void>("/api/v2/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: current.refreshToken })
        });
      }
    } catch {
      // Always clear the local session even if the Gateway is unavailable.
    }
  }, [navigate]);

  if (location.pathname === routes.verifyEmail) {
    return (
      <Suspense fallback={<WorkspaceLoadingFallback message="Đang tải trang xác minh email…" />}>
        <VerifyEmailPage />
      </Suspense>
    );
  }
  if (location.pathname === routes.resetPassword) {
    return (
      <Suspense fallback={<WorkspaceLoadingFallback message="Đang tải trang đặt lại mật khẩu…" />}>
        <ResetPasswordPage />
      </Suspense>
    );
  }

  const loginSucceeded = (authenticated: AuthSession) => {
    setSessionVerified(false);
    setSession(authenticated);
  };

  return (
    <main className={`min-h-screen bg-canvas ${session ? "authenticated-shell" : "public-portal-shell"}`}>
      {!sessionVerified ? (
        <div className="min-h-screen flex items-center justify-center px-4">
          <section className="w-full max-w-md rounded-2xl border border-border-subtle bg-surface p-6 shadow-card space-y-4">
            {verificationError ? (
              <>
                <ErrorBanner tone="error" message={verificationError} />
                <div className="flex flex-wrap gap-2.5 justify-end">
                  <Button type="button" onClick={() => setVerificationAttempt((attempt) => attempt + 1)}>
                    Thử xác minh lại
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { void logout(); }}>
                    Đăng xuất
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 justify-center py-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                <p className="text-sm font-medium text-ink-600 m-0">Đang xác thực phiên đăng nhập…</p>
              </div>
            )}
          </section>
        </div>
      ) : session ? (
        <Suspense fallback={<WorkspaceLoadingFallback />}>
          {location.pathname === routes.acceptInvitation && !session.roles.includes("RECRUITER") ? (
            <main className="mx-auto max-w-lg px-4 py-16">
              <section
                role="alert"
                className="rounded-2xl border border-border-subtle bg-white p-6 shadow-card space-y-4"
              >
                <h1 className="text-lg font-bold text-ink-900 m-0">Liên kết mời thành viên công ty</h1>
                <p className="text-sm text-ink-600 m-0">
                  Tài khoản hiện tại không có vai trò nhà tuyển dụng. Hãy đăng xuất rồi đăng nhập bằng tài khoản nhà tuyển dụng được mời để chấp nhận lời mời này.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 cursor-pointer"
                  >
                    Đăng xuất để dùng tài khoản nhà tuyển dụng
                  </button>
                  <a
                    href={routes.home}
                    className="rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-ink-700 no-underline hover:bg-slate-50"
                  >
                    Về trang chính
                  </a>
                </div>
              </section>
            </main>
          ) : session.roles.includes("SYSTEM_ADMIN") ? (
            <AdminWorkspace session={session} onLogout={logout} />
          ) : session.roles.includes("RECRUITER") ? (
            location.pathname === routes.acceptInvitation ? (
              <AcceptCompanyInvitationPage session={session} onLogout={logout} />
            ) : (
              <RecruiterWorkspace session={session} onLogout={logout} />
            )
          ) : (
            <CandidateProfilePage session={session} onLogout={logout} />
          )}
        </Suspense>
      ) : (
        <PublicHomePage onLoginSuccess={loginSucceeded} />
      )}
    </main>
  );
}

export function App() {
  return (
    <EnsureRouter>
      <AppContent />
    </EnsureRouter>
  );
}
