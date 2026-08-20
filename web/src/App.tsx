import { useCallback, useState } from "react";

import { CandidateProfilePage } from "./features/candidate/CandidateProfilePage";
import { LoginPage } from "./features/auth/LoginPage";
import { VerifyEmailPage } from "./features/auth/VerifyEmailPage";
import { apiRequest } from "./shared/api/client";
import { SystemOverview } from "./features/system/SystemOverview";
import { clearSession, loadSession, AuthSession } from "./shared/auth/session";

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
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

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">DATN · Candidate vertical slice</p>
        <h1>Explainable IT Recruitment</h1>
        <p>Web chỉ gọi public Gateway; hồ sơ ứng viên được lưu bởi Core và bảo vệ bằng JWT.</p>
      </header>
      {session ? (
        <CandidateProfilePage session={session} onLogout={logout} />
      ) : (
        <>
          <LoginPage onSuccess={setSession} />
          <SystemOverview />
        </>
      )}
    </main>
  );
}
