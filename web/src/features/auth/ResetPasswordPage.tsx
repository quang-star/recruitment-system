import { FormEvent, useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { CheckCircleIcon } from "../../shared/components/Icon";
import { Button, Card, ErrorBanner } from "../../shared/ui";

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "Thiếu mã đặt lại mật khẩu.");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    if (newPassword !== confirmPassword) {
      setError("Hai mật khẩu chưa trùng khớp.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRequest<void>("/api/v2/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword })
      });
      setDone(true);
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.error.message
          : "Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
      <Card padding="lg" className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" aria-hidden="true" className="h-10 w-10 shrink-0 object-contain" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">Khôi phục tài khoản</p>
            <h1 className="text-xl font-bold text-ink-900 m-0">Đặt lại mật khẩu</h1>
          </div>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              <CheckCircleIcon size={18} className="shrink-0 mt-0.5 text-emerald-600" />
              <span>Mật khẩu đã được đặt lại. Tất cả phiên đăng nhập cũ đã được thu hồi để bảo mật tài khoản.</span>
            </div>
            <a
              href="/"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors no-underline"
            >
              Đăng nhập lại
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1.5 text-sm font-medium text-ink-800">
              <span>Mật khẩu mới</span>
              <input
                type="password"
                required
                minLength={12}
                maxLength={128}
                placeholder="Tối thiểu 12 ký tự"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={!token || busy}
                className="h-10 w-full rounded-xl border border-border-strong bg-white px-3.5 text-sm text-ink-900 focus:border-brand-600 focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-ink-800">
              <span>Nhập lại mật khẩu</span>
              <input
                type="password"
                required
                minLength={12}
                maxLength={128}
                placeholder="Nhập lại tối thiểu 12 ký tự"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={!token || busy}
                className="h-10 w-full rounded-xl border border-border-strong bg-white px-3.5 text-sm text-ink-900 focus:border-brand-600 focus:outline-none"
              />
            </label>
            {error && <ErrorBanner tone="error" message={error} />}
            <Button type="submit" disabled={!token || busy} className="w-full">
              {busy ? "Đang cập nhật…" : "Đặt lại mật khẩu"}
            </Button>
            <div className="text-center">
              <a href="/" className="text-xs font-semibold text-brand-700 hover:text-brand-800 no-underline">
                Quay lại trang chủ
              </a>
            </div>
          </form>
        )}
      </Card>
    </main>
  );
}
