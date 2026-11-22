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
import { useIsNarrowViewport } from "./shared/layout/useDesktopWorkspaceGuard";
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
      <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 text-center shadow-card">
        <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <p className="text-sm font-medium text-ink-600 m-0">{message}</p>
      </div>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const isNarrowViewport = useIsNarrowViewport();
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
    const shouldReturnHome = /^\/(candidate|recruiter|admin)(\/|$)/.test(pathnameRef.current);
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

  const opensRecruiter = session?.roles.includes("RECRUITER") &&
    (!session.roles.includes("CANDIDATE") || /^\/recruiter(\/|$)/.test(location.pathname));

  return (
    <main className={`min-h-screen bg-canvas ${session ? "authenticated-shell" : "public-portal-shell"}`}>
      {!sessionVerified ? (
        <div className="min-h-screen flex items-center justify-center px-4">
          <section className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-card space-y-4">
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
          {location.pathname === routes.acceptInvitation ? (
            <AcceptCompanyInvitationPage key={location.search} session={session} onLogout={logout}
              isNarrowViewport={isNarrowViewport} />
          ) : session.roles.includes("SYSTEM_ADMIN") ? (
            isNarrowViewport ? (
              <div className="min-h-screen flex items-center justify-center px-4 py-12">
                <section
                  role="status"
                  className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-card space-y-4"
                >
                  <h1 className="text-lg font-bold text-ink-900 m-0">
                    Không gian này chỉ hỗ trợ màn hình máy tính
                  </h1>
                  <p className="text-sm text-ink-600 m-0 leading-relaxed">
                    Giao diện điện thoại chỉ dành cho khách tìm việc và ứng viên. Vui lòng mở bằng máy tính để sử dụng không gian Quản trị viên, hoặc đăng xuất để đổi tài khoản.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="primary" onClick={() => { void logout(); }}>
                      Đăng xuất
                    </Button>
                  </div>
                </section>
              </div>
            ) : (
              <AdminWorkspace session={session} onLogout={logout} />
            )
          ) : opensRecruiter ? (
            isNarrowViewport ? (
              <div className="min-h-screen flex items-center justify-center px-4 py-12">
                <section
                  role="status"
                  className="w-full max-w-md rounded-lg border border-border-subtle bg-surface p-6 shadow-card space-y-4"
                >
                  <h1 className="text-lg font-bold text-ink-900 m-0">
                    Không gian này chỉ hỗ trợ màn hình máy tính
                  </h1>
                  <p className="text-sm text-ink-600 m-0 leading-relaxed">
                    Giao diện điện thoại chỉ dành cho khách tìm việc và ứng viên. Vui lòng mở bằng máy tính để sử dụng không gian Nhà tuyển dụng, hoặc đăng xuất để đổi tài khoản.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {session.roles.includes("CANDIDATE") && (
                      <Button type="button" variant="secondary" onClick={() => navigate(routes.candidate.dashboard)}>
                        Về không gian Ứng viên
                      </Button>
                    )}
                    <Button type="button" variant="primary" onClick={() => { void logout(); }}>
                      Đăng xuất
                    </Button>
                  </div>
                </section>
              </div>
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
