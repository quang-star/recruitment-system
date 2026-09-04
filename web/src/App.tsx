import { useCallback, useEffect, useState } from "react";

import { CandidateProfilePage } from "./features/candidate/CandidateProfilePage";
import { LoginPage } from "./features/auth/LoginPage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./features/auth/VerifyEmailPage";
import { apiRequest } from "./shared/api/client";
import { SystemOverview } from "./features/system/SystemOverview";
import { RecruiterWorkspace } from "./features/recruiter/RecruiterWorkspace";
import { AcceptCompanyInvitationPage } from "./features/recruiter/AcceptCompanyInvitationPage";
import { clearSession, loadSession, saveSession, AuthSession } from "./shared/auth/session";

type CurrentUser = { userId: string; status: string; emailVerified: boolean; roles: string[]; };

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [sessionVerified, setSessionVerified] = useState(() => loadSession() === null);

  useEffect(() => {
    if (!session) { setSessionVerified(true); return; }
    let active = true;
    setSessionVerified(false);
    void apiRequest<CurrentUser>("/api/v1/auth/me", { accessToken: session.accessToken })
      .then((currentUser) => {
        if (!active) return;
        const verified = { ...session, userId: currentUser.userId, roles: currentUser.roles };
        saveSession(verified);
        setSession(verified);
        setSessionVerified(true);
      })
      .catch(() => {
        if (!active) return;
        clearSession(); setSession(null); setSessionVerified(true);
      });
    return () => { active = false; };
  }, [session?.accessToken]);
  const logout = useCallback(async () => {
    try {
      if (session?.refreshToken) {
        await apiRequest<void>("/api/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: session.refreshToken })
        });
      }
    } catch {
      // Always clear the local session even if the Gateway is unavailable.
    } finally {
      clearSession();
      setSession(null);
    }
  }, [session]);

  if (window.location.pathname === "/verify-email") {
    return <VerifyEmailPage />;
  }
  if (window.location.pathname === "/reset-password") {
    return <ResetPasswordPage />;
  }

  const loginSucceeded = (authenticated: AuthSession) => {
    setSessionVerified(false);
    setSession(authenticated);
  };

  return (
    <main className={`shell ${session ? "authenticated-shell" : ""}`}>
      {!session && <header className="landing-header">
      <p className="eyebrow">DATN · recruitment workspace</p>
        <h1>Explainable IT Recruitment</h1>
        <p>Web chỉ gọi public Gateway; hồ sơ ứng viên được lưu bởi Core và bảo vệ bằng JWT.</p>
      </header>}
      {!sessionVerified ? <section className="auth-card"><p className="muted">Đang xác thực phiên đăng nhập…</p></section> : session ? (
        session.roles.includes("RECRUITER")
          ? window.location.pathname === "/accept-invitation"
            ? <AcceptCompanyInvitationPage session={session} onLogout={logout} />
            : <RecruiterWorkspace session={session} onLogout={logout} />
          : <CandidateProfilePage session={session} onLogout={logout} />
      ) : (
        <>
          <LoginPage onSuccess={loginSucceeded} />
          <SystemOverview />
        </>
      )}
    </main>
  );
}
