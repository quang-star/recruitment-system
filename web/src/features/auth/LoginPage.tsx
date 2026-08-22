import { FormEvent, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession, saveSession } from "../../shared/auth/session";

type LoginResponse = AuthSession;

type LoginPageProps = {
  onSuccess: (session: AuthSession) => void;
};

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountType, setAccountType] = useState<"CANDIDATE" | "RECRUITER">("CANDIDATE");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setRegistrationMessage(null);

    try {
      if (mode === "register") {
        await apiRequest<{ verificationRequired: boolean }>("/api/v1/auth/register", {
          method: "POST", body: JSON.stringify({ email, password, accountType })
        });
        setRegistrationMessage("Đăng ký thành công. Hãy xác minh email trong Mailpit rồi quay lại đăng nhập.");
        setMode("login");
      } else {
        const session = await apiRequest<LoginResponse>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, clientType: "WEB", deviceName: "Browser" })
        });
        saveSession(session);
        onSuccess(session);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiClientError
        ? requestError.error.message
        : "Không thể kết nối tới Gateway. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="login-title">
      <div>
        <p className="eyebrow">{mode === "login" ? "Account access" : "Create account"}</p>
        <h2 id="login-title">{mode === "login" ? "Đăng nhập workspace" : "Tạo tài khoản"}</h2>
        <p className="muted">Tài khoản cần được xác minh email trước khi đăng nhập.</p>
      </div>
      <div className="auth-switch" role="tablist" aria-label="Account action">
        <button className={mode === "login" ? "selected" : ""} type="button" onClick={() => { setMode("login"); setError(null); }}>Đăng nhập</button>
        <button className={mode === "register" ? "selected" : ""} type="button" onClick={() => { setMode("register"); setError(null); }}>Đăng ký</button>
      </div>
      <form onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
        {mode === "register" && <label>Loại tài khoản<select value={accountType} onChange={(event) => setAccountType(event.target.value as "CANDIDATE" | "RECRUITER")}><option value="CANDIDATE">Ứng viên</option><option value="RECRUITER">Nhà tuyển dụng</option></select></label>}
        {registrationMessage && <p className="success-message" role="status">{registrationMessage}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
        </button>
      </form>
    </section>
  );
}
