import { FormEvent, useCallback, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";
import { GoogleSignIn } from "./GoogleSignIn";

type AccountSession = {
  sessionId: string;
  clientType: string;
  deviceName: string | null;
  userAgent: string | null;
  createdIp: string | null;
  lastSeenIp: string | null;
  authenticatedAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  active: boolean;
};

type Props = { session: AuthSession; onLogout: () => void };

const inputClass =
  "mt-1.5 h-10 w-full rounded-xl border border-border-strong bg-white px-3.5 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function AccountSecurityPanel({ session, onLogout }: Props) {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [googleLinked, setGoogleLinked] = useState(false);

  async function linkGoogle(credential: string, nonce: string) {
    await apiRequest<void>("/api/v2/auth/google/link", {
      method: "POST",
      accessToken: session.accessToken,
      body: JSON.stringify({ credential, nonce })
    });
    setGoogleLinked(true);
  }

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      setSessions(
        await apiRequest<AccountSession[]>("/api/v2/auth/sessions", {
          accessToken: session.accessToken
        })
      );
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setLoadingSessions(false);
    }
  }, [onLogout, session.accessToken]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function revoke(sessionId: string) {
    if (revokingId) return;
    setRevokingId(sessionId);
    setMessage(null);
    setError(null);
    try {
      await apiRequest<void>(`/api/v2/auth/sessions/${sessionId}`, {
        method: "DELETE",
        accessToken: session.accessToken
      });
      setSessions((current) =>
        current.map((item) =>
          item.sessionId === sessionId
            ? {
                ...item,
                active: false,
                revokedAt: new Date().toISOString(),
                revokeReason: "USER_REVOKED"
              }
            : item
        )
      );
      setMessage("Phiên đã được thu hồi.");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setRevokingId(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changing) return;
    if (newPassword !== confirmation) {
      setError("Hai mật khẩu mới chưa trùng khớp.");
      return;
    }
    setChanging(true);
    setMessage(null);
    setError(null);
    try {
      await apiRequest<void>("/api/v2/auth/change-password", {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setMessage("Mật khẩu đã đổi. Hệ thống đang đăng xuất các phiên cũ…");
      onLogout();
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="space-y-6" aria-labelledby="account-security-title">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Card as="section" padding="lg" className="space-y-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
              Account security
            </p>
            <h3 id="account-security-title" className="text-lg font-bold text-ink-900 m-0 mt-0.5">
              Mật khẩu & phiên đăng nhập
            </h3>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <label className="block text-sm font-medium text-ink-800">
              Mật khẩu hiện tại
              <input
                type="password"
                autoComplete="current-password"
                minLength={8}
                maxLength={128}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-ink-800">
              Mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium text-ink-800">
              Nhập lại mật khẩu mới
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                className={inputClass}
              />
            </label>
            <Button type="submit" disabled={changing}>
              {changing ? "Đang đổi…" : "Đổi mật khẩu và đăng xuất mọi phiên"}
            </Button>
          </form>
        </Card>

        <Card as="section" padding="lg" className="space-y-4">
          <h3 className="text-lg font-bold text-ink-900 m-0">Liên kết Google</h3>
          <p className="text-sm text-ink-600 m-0 leading-relaxed">
            Chọn tài khoản Google có cùng email với tài khoản hiện tại để dùng cho những lần đăng nhập sau.
            Nếu chỉ đăng nhập bằng Google, bạn có thể tạo mật khẩu qua “Quên mật khẩu” trên trang đăng nhập.
          </p>
          {googleLinked ? (
            <p
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900 m-0"
              role="status"
            >
              Đã liên kết Google. Bạn có thể đăng nhập bằng Google từ lần sau.
            </p>
          ) : (
            <GoogleSignIn onCredential={linkGoogle} />
          )}
        </Card>
      </div>

      <Card as="section" padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-ink-900 m-0">Các phiên gần đây</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loadingSessions}
            onClick={() => void loadSessions()}
          >
            Tải lại
          </Button>
        </div>

        {loadingSessions ? (
          <p className="text-sm text-ink-500 m-0">Đang tải phiên đăng nhập…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-500 m-0">Không có phiên nào.</p>
        ) : (
          <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle overflow-hidden">
            {sessions.map((item) => (
              <div
                key={item.sessionId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 py-3.5"
              >
                <div className="space-y-0.5 min-w-0">
                  <strong className="block text-sm font-semibold text-ink-900">
                    {item.deviceName || item.clientType}
                  </strong>
                  <small className="block text-xs text-ink-500">
                    {item.lastSeenIp || item.createdIp || "IP không xác định"} · hoạt động {formatTime(item.lastSeenAt)}
                  </small>
                  <small className="block text-xs text-ink-500">
                    {item.active
                      ? `Hết hạn ${formatTime(item.idleExpiresAt)}`
                      : `Đã thu hồi${item.revokeReason ? ` · ${item.revokeReason}` : ""}`}
                  </small>
                </div>
                {item.active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={revokingId === item.sessionId}
                    onClick={() => void revoke(item.sessionId)}
                  >
                    {revokingId === item.sessionId ? "Đang thu hồi…" : "Thu hồi"}
                  </Button>
                ) : (
                  <Badge tone="neutral">INACTIVE</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {message && (
          <p
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900 m-0"
            role="status"
          >
            {message}
          </p>
        )}
        {error && <ErrorBanner tone="error" message={error} />}
      </Card>
    </div>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
