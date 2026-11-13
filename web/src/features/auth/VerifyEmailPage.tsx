import { useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { CheckCircleIcon, SparklesIcon } from "../../shared/components/Icon";
import { Card, ErrorBanner } from "../../shared/ui";

export function VerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [status, setStatus] = useState<"pending" | "ok" | "error">(token ? "pending" : "error");
  const [message, setMessage] = useState(
    token ? "Đang xác minh địa chỉ email của bạn…" : "Thiếu mã xác minh email."
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    void apiRequest<{ message: string }>("/api/v2/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token })
    })
      .then((response) => {
        if (!active) return;
        setStatus("ok");
        setMessage(response.message || "Email đã được xác minh thành công.");
      })
      .catch((requestError) => {
        if (!active) return;
        setStatus("error");
        setMessage(
          requestError instanceof ApiClientError
            ? requestError.error.message
            : "Không thể xác minh email. Liên kết có thể đã hết hạn."
        );
      });
    return () => { active = false; };
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
      <Card padding="lg" className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
            <SparklesIcon size={20} />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">Xác thực tài khoản</p>
            <h1 className="text-xl font-bold text-ink-900 m-0">Xác minh email</h1>
          </div>
        </div>

        {status === "pending" && (
          <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-slate-50 px-4 py-3 text-sm text-ink-700" role="status">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {status === "ok" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              <CheckCircleIcon size={18} className="shrink-0 mt-0.5 text-emerald-600" />
              <span>{message}</span>
            </div>
          </div>
        )}

        {status === "error" && <ErrorBanner tone="error" message={message} />}

        <div className="pt-2">
          <a
            href="/"
            className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors no-underline"
          >
            Quay lại trang chủ đăng nhập
          </a>
        </div>
      </Card>
    </main>
  );
}
