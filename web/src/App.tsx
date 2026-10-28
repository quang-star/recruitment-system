import { useCallback, useEffect, useRef, useState } from "react";

import { CandidateProfilePage } from "./features/candidate/CandidateProfilePage";
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./features/auth/VerifyEmailPage";
import { apiRequest } from "./shared/api/client";
import { RecruiterWorkspace } from "./features/recruiter/RecruiterWorkspace";
import { AdminWorkspace } from "./features/admin/AdminWorkspace";
import { AcceptCompanyInvitationPage } from "./features/recruiter/AcceptCompanyInvitationPage";
import { clearSession, loadSession, updateSession, sessionGeneration, subscribeSession, AuthSession } from "./shared/auth/session";
import { PublicHomePage } from "./features/public/PublicHomePage";

type CurrentUser = { userId: string; status: string; emailVerified: boolean; roles: string[]; };

export function App() {
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
        const verified = { ...latest, roles: currentUser.roles };
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
    const current = loadSession();
    clearSession();
    setSession(null);
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
  }, []);

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
    <main className={`shell ${session ? "authenticated-shell" : "public-portal-shell"}`}>
      {!sessionVerified ? (
        <section className="auth-card loading-card">
          {verificationError ? <>
            <p className="error-message" role="alert">{verificationError}</p>
            <button type="button" onClick={() => setVerificationAttempt((attempt) => attempt + 1)}>Thử xác minh lại</button>
            <button type="button" className="secondary-button" onClick={() => { void logout(); }}>Đăng xuất</button>
          </> : <p className="muted">Đang xác thực phiên đăng nhập…</p>}
        </section>
      ) : session ? (
        session.roles.includes("SYSTEM_ADMIN") ? <AdminWorkspace session={session} onLogout={logout} /> : session.roles.includes("RECRUITER") ? (
          window.location.pathname === "/accept-invitation" ? (
            <AcceptCompanyInvitationPage session={session} onLogout={logout} />
          ) : (
            <RecruiterWorkspace session={session} onLogout={logout} />
          )
        ) : (
          <CandidateProfilePage session={session} onLogout={logout} />
        )
      ) : (
        <PublicHomePage onLoginSuccess={loginSucceeded} />
      )}
    </main>
  );
}
