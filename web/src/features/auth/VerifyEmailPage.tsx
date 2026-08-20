import { useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";

type VerificationResponse = {
  userId: string;
  email: string;
  status: string;
};

type VerificationState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; email: string }
  | { type: "error"; message: string };

export function VerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [state, setState] = useState<VerificationState>({ type: "idle" });

  async function verifyEmail() {
    if (!token || state.type === "loading") return;
    setState({ type: "loading" });
    try {
      const response = await apiRequest<VerificationResponse>("/api/v1/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ token })
      });
      setState({ type: "success", email: response.email });
    } catch (error) {
      const message = error instanceof ApiClientError
        ? error.error.message
        : "Không thể kết nối tới hệ thống. Vui lòng thử lại.";
      setState({ type: "error", message });
    }
  }

  return (
    <main className="shell verification-shell">
      <section className="verification-card" aria-live="polite">
        <p className="eyebrow">Xác minh tài khoản</p>
        <h1>Xác minh email</h1>
        {!token && <p>Liên kết không chứa mã xác minh hợp lệ.</p>}
        {token && state.type === "idle" && (
          <>
            <p>Nhấn nút bên dưới để kích hoạt tài khoản Smart Recruitment của bạn.</p>
            <button type="button" onClick={verifyEmail}>Xác minh email</button>
          </>
        )}
        {state.type === "loading" && <p>Đang xác minh…</p>}
        {state.type === "success" && (
          <>
            <p className="success-message">Đã xác minh thành công {state.email}.</p>
            <a href="/">Về trang chủ</a>
          </>
        )}
        {state.type === "error" && (
          <>
            <p className="error-message">{state.message}</p>
            <button type="button" onClick={verifyEmail}>Thử lại</button>
          </>
        )}
      </section>
    </main>
  );
}
