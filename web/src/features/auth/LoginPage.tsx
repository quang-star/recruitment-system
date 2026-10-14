import { FormEvent, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession, saveSession } from "../../shared/auth/session";

type LoginResponse = AuthSession;

type LoginPageProps = {
  onSuccess: (session: AuthSession) => void;
};

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
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
      if (mode === "forgot") {
        await apiRequest<{ message: string }>("/api/v1/auth/forgot-password", {
          method: "POST", body: JSON.stringify({ email })
        });
        setRegistrationMessage("Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi qua email.");
      } else if (mode === "register") {
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

  async function resendVerification() {
    if (!email || submitting) return;
    setSubmitting(true);
    setError(null);
    setRegistrationMessage(null);
    try {
      await apiRequest<{ message: string }>("/api/v1/auth/resend-verification", {
        method: "POST", body: JSON.stringify({ email })
      });
      setRegistrationMessage("Nếu tài khoản đang chờ xác minh, hệ thống đã gửi một liên kết mới qua email.");
    } catch (requestError) {
      setError(requestError instanceof ApiClientError
        ? requestError.error.message
        : "Không thể kết nối tới Gateway. Vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: "login" | "register" | "forgot") {
    setMode(nextMode);
    setError(null);
    setRegistrationMessage(null);
  }

  return (
    <section className="auth-card" aria-labelledby="login-title">
      <div>
        <p className="eyebrow">{mode === "login" ? "Account access" : mode === "register" ? "Create account" : "Account recovery"}</p>
        <h2 id="login-title">{mode === "login" ? "Đăng nhập workspace" : mode === "register" ? "Tạo tài khoản" : "Quên mật khẩu"}</h2>
        <p className="muted">{mode === "forgot"
          ? "Nhập email để nhận liên kết đặt lại mật khẩu có hiệu lực trong 30 phút."
          : "Tài khoản cần được xác minh email trước khi đăng nhập."}</p>
      </div>
      <div className="auth-switch" role="tablist" aria-label="Account action">
        <button className={mode === "login" ? "selected" : ""} type="button" onClick={() => switchMode("login")}>Đăng nhập</button>
        <button className={mode === "register" ? "selected" : ""} type="button" onClick={() => switchMode("register")}>Đăng ký</button>
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
        {mode !== "forgot" && <label>
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>}
        {mode === "register" && <label>Loại tài khoản<select value={accountType} onChange={(event) => setAccountType(event.target.value as "CANDIDATE" | "RECRUITER")}><option value="CANDIDATE">Ứng viên</option><option value="RECRUITER">Nhà tuyển dụng</option></select></label>}
        {registrationMessage && <p className="success-message" role="status">{registrationMessage}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : mode === "register" ? "Tạo tài khoản" : "Gửi hướng dẫn"}
        </button>
        {mode === "login" && <div className="auth-actions">
          <button className="text-button" type="button" onClick={() => switchMode("forgot")}>Quên mật khẩu?</button>
          <button className="text-button" type="button" disabled={!email || submitting} onClick={resendVerification}>Gửi lại email xác minh</button>
        </div>}
        {mode === "forgot" && <button className="text-button" type="button" onClick={() => switchMode("login")}>Quay lại đăng nhập</button>}
      </form>
    </section>
  );
}
