import { FormEvent, useCallback, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession, loadSession, sessionGeneration, updateSession } from "../../shared/auth/session";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";

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
  current?: boolean;
};

type CurrentUserStatus = {
  email?: string;
  hasPassword?: boolean;
  googleLinked?: boolean;
};

type Props = { session: AuthSession; onLogout: () => void };

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-border-strong bg-white px-3.5 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function AccountSecurityPanel({ session, onLogout }: Props) {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [changing, setChanging] = useState(false);
  const [sendingPasswordSetup, setSendingPasswordSetup] = useState(false);
  const [passwordSetupMessage, setPasswordSetupMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(session.email ?? null);
  const [hasPassword, setHasPassword] = useState(session.hasPassword ?? true);
  const [accountStatusLoading, setAccountStatusLoading] = useState(session.hasPassword === undefined);

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

  useEffect(() => {
    let active = true;
    const generation = sessionGeneration();
    if (session.hasPassword === undefined) {
      setAccountStatusLoading(true);
    }
    void apiRequest<CurrentUserStatus>("/api/v2/auth/me", {
      accessToken: session.accessToken
    })
      .then((me) => {
        if (!active) return;
        const nextEmail = typeof me?.email === "string" ? me.email : undefined;
        const nextHasPassword = typeof me?.hasPassword === "boolean" ? me.hasPassword : undefined;
        const nextGoogleLinked = typeof me?.googleLinked === "boolean" ? me.googleLinked : undefined;
        if (nextEmail !== undefined) setAccountEmail(nextEmail);
        if (nextHasPassword !== undefined) setHasPassword(nextHasPassword);
        const latest = loadSession();
        if (
          latest &&
          generation === sessionGeneration() &&
          (nextEmail !== undefined || nextHasPassword !== undefined || nextGoogleLinked !== undefined)
        ) {
          updateSession(
            {
              ...latest,
              ...(nextEmail !== undefined ? { email: nextEmail } : {}),
              ...(nextHasPassword !== undefined ? { hasPassword: nextHasPassword } : {}),
              ...(nextGoogleLinked !== undefined ? { googleLinked: nextGoogleLinked } : {})
            },
            latest.refreshToken,
            generation
          );
        }
      })
      .catch((requestError) => {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      })
      .finally(() => {
        if (active) setAccountStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onLogout, session.accessToken, session.hasPassword]);

  async function revoke(sessionId: string, isCurrent: boolean) {
    if (revokingId) return;
    setRevokingId(sessionId);
    setMessage(null);
    setError(null);
    try {
      await apiRequest<void>(`/api/v2/auth/sessions/${sessionId}`, {
        method: "DELETE",
        accessToken: session.accessToken
      });
      if (isCurrent) {
        onLogout();
        return;
      }
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
      setMessage("Phiên đã được thu hồi. Phiên đó không thể làm mới và sẽ bị đăng xuất khi xác thực lại.");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setRevokingId(null);
    }
  }

  async function sendPasswordSetupEmail() {
    if (!accountEmail || sendingPasswordSetup) return;
    setSendingPasswordSetup(true);
    setError(null);
    setMessage(null);
    setPasswordSetupMessage(null);
    try {
      await apiRequest<{ message: string }>("/api/v2/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: accountEmail })
      });
      setPasswordSetupMessage(
        `Đã gửi hướng dẫn tạo mật khẩu tới ${accountEmail}. Mở liên kết trong email (có hiệu lực 30 phút) để thiết lập mật khẩu.`
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSendingPasswordSetup(false);
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
      <Card as="section" padding="lg" className="space-y-5">
        <div>
          <h3 id="account-security-title" className="text-lg font-bold text-ink-900 m-0">
            Mật khẩu & phiên đăng nhập
          </h3>
        </div>

          {accountStatusLoading ? (
            <p className="text-sm text-ink-500 m-0">Đang kiểm tra phương thức đăng nhập…</p>
          ) : hasPassword ? (
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
                  placeholder="Tối thiểu 12 ký tự"
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
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 space-y-2">
                <Badge tone="info">Chưa đặt mật khẩu riêng</Badge>
                <p className="text-sm text-ink-800 m-0 leading-relaxed">
                  Tài khoản này hiện đăng nhập bằng Google và chưa có mật khẩu riêng.
                  Bạn có thể gửi liên kết tạo mật khẩu về email để đăng nhập thêm bằng email và mật khẩu.
                </p>
              </div>
              {accountEmail && (
                <div className="space-y-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={sendingPasswordSetup || Boolean(passwordSetupMessage)}
                    onClick={() => void sendPasswordSetupEmail()}
                  >
                    {sendingPasswordSetup
                      ? "Đang gửi liên kết…"
                      : passwordSetupMessage
                        ? "Đã gửi liên kết tạo mật khẩu"
                        : "Gửi liên kết tạo mật khẩu qua email"}
                  </Button>
                  {passwordSetupMessage && (
                    <p
                      className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900 m-0"
                      role="status"
                    >
                      {passwordSetupMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

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
          <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle overflow-hidden">
            {sessions.map((item) => (
              <div
                key={item.sessionId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 py-3.5"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-semibold text-ink-900">
                      {item.deviceName || item.clientType}
                    </strong>
                    {item.current && item.active && <Badge tone="info">Phiên hiện tại</Badge>}
                  </div>
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
                    onClick={() => void revoke(item.sessionId, Boolean(item.current))}
                  >
                    {revokingId === item.sessionId
                      ? "Đang thu hồi…"
                      : item.current
                        ? "Thu hồi & đăng xuất"
                        : "Thu hồi"}
                  </Button>
                ) : (
                  <Badge tone="neutral">Đã thu hồi</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {message && (
          <p
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900 m-0"
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
