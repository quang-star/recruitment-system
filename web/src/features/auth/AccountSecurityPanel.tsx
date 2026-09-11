import { FormEvent, useCallback, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

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

type Props = { session: AuthSession; onLogout: () => void; };

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

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      setSessions(await apiRequest<AccountSession[]>("/api/v1/auth/sessions", { accessToken: session.accessToken }));
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setLoadingSessions(false);
    }
  }, [onLogout, session.accessToken]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function revoke(sessionId: string) {
    if (revokingId) return;
    setRevokingId(sessionId);
    setMessage(null);
    setError(null);
    try {
      await apiRequest<void>(`/api/v1/auth/sessions/${sessionId}`, {
        method: "DELETE", accessToken: session.accessToken
      });
      setSessions((current) => current.map((item) => item.sessionId === sessionId
        ? { ...item, active: false, revokedAt: new Date().toISOString(), revokeReason: "USER_REVOKED" }
        : item));
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
      await apiRequest<void>("/api/v1/auth/change-password", {
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

  return <section className="workspace-panel security-panel" aria-labelledby="account-security-title">
    <div className="section-heading"><div><p className="eyebrow">Account security</p><h3 id="account-security-title">Mật khẩu & phiên đăng nhập</h3></div></div>
    <form onSubmit={changePassword}>
      <label>Mật khẩu hiện tại<input type="password" autoComplete="current-password" minLength={8} maxLength={128}
        value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
      <label>Mật khẩu mới<input type="password" autoComplete="new-password" minLength={12} maxLength={128}
        value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
      <label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" minLength={12} maxLength={128}
        value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
      <button type="submit" disabled={changing}>{changing ? "Đang đổi…" : "Đổi mật khẩu và đăng xuất mọi phiên"}</button>
    </form>
    <div className="section-heading"><h3>Các phiên gần đây</h3><button className="text-button" type="button" disabled={loadingSessions} onClick={() => void loadSessions()}>Tải lại</button></div>
    {loadingSessions ? <p className="muted">Đang tải phiên đăng nhập…</p> : sessions.length === 0 ? <p className="muted">Không có phiên nào.</p> : <div className="session-list">
      {sessions.map((item) => <div className="session-row" key={item.sessionId}>
        <span><strong>{item.deviceName || item.clientType}</strong><small>{item.lastSeenIp || item.createdIp || "IP không xác định"} · hoạt động {formatTime(item.lastSeenAt)}</small><small>{item.active ? `Hết hạn ${formatTime(item.idleExpiresAt)}` : `Đã thu hồi${item.revokeReason ? ` · ${item.revokeReason}` : ""}`}</small></span>
        {item.active ? <button className="danger-button" type="button" disabled={revokingId === item.sessionId} onClick={() => void revoke(item.sessionId)}>{revokingId === item.sessionId ? "Đang thu hồi…" : "Thu hồi"}</button> : <span className="status-pill">INACTIVE</span>}
      </div>)}
    </div>}
    {message && <p className="success-message" role="status">{message}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
