import { FormEvent, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";

type ResetState = "idle" | "submitting" | "success";

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState<ResetState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || state === "submitting") return;
    if (password !== confirmation) {
      setError("Hai mật khẩu chưa trùng khớp.");
      return;
    }
    setState("submitting");
    setError(null);
    try {
      await apiRequest<void>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password })
      });
      setState("success");
    } catch (requestError) {
      setError(requestError instanceof ApiClientError
        ? requestError.error.message
        : "Không thể kết nối tới hệ thống. Vui lòng thử lại.");
      setState("idle");
    }
  }

  return (
    <main className="shell verification-shell">
      <section className="verification-card" aria-live="polite">
        <p className="eyebrow">Account recovery</p>
        <h1>Đặt lại mật khẩu</h1>
        {!token && <><p className="error-message">Liên kết không chứa mã đặt lại mật khẩu hợp lệ.</p><a href="/">Về trang đăng nhập</a></>}
        {token && state !== "success" && <form onSubmit={submit}>
          <p className="muted">Mật khẩu mới phải có ít nhất 12 ký tự và khác mật khẩu hiện tại.</p>
          <label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={12} maxLength={128}
            value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label>Nhập lại mật khẩu<input type="password" autoComplete="new-password" minLength={12} maxLength={128}
            value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button type="submit" disabled={state === "submitting"}>{state === "submitting" ? "Đang cập nhật…" : "Đặt lại mật khẩu"}</button>
        </form>}
        {state === "success" && <>
          <p className="success-message">Mật khẩu đã được cập nhật. Tất cả phiên đăng nhập cũ đã bị thu hồi.</p>
          <a href="/">Đăng nhập bằng mật khẩu mới</a>
        </>}
      </section>
    </main>
  );
}
