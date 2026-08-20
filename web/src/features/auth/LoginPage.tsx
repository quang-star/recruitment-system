import { FormEvent, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession, saveSession } from "../../shared/auth/session";

type LoginResponse = AuthSession;

type LoginPageProps = {
  onSuccess: (session: AuthSession) => void;
};

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const session = await apiRequest<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, clientType: "WEB", deviceName: "Browser" })
      });
      saveSession(session);
      onSuccess(session);
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
        <p className="eyebrow">Candidate workspace</p>
        <h2 id="login-title">Đăng nhập để mở hồ sơ</h2>
        <p className="muted">Tài khoản cần được xác minh email trước khi đăng nhập.</p>
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
        {error && <p className="error-message" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </form>
    </section>
  );
}
