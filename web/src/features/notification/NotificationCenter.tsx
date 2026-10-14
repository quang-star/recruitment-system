import { useCallback, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

type Notification = {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
  version: number;
};

type Feed = { items: Notification[]; unreadCount: number; };
type Props = { session: AuthSession; onLogout: () => void; };

export function NotificationCenter({ session, onLogout }: Props) {
  const [feed, setFeed] = useState<Feed>({ items: [], unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFeed(await apiRequest<Feed>("/api/v1/notifications?limit=30", { accessToken: session.accessToken }));
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [onLogout, session.accessToken]);

  useEffect(() => { void load(); }, [load]);

  async function markRead(notification: Notification) {
    if (busy || notification.readAt) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest<void>(`/api/v1/notifications/${notification.notificationId}/read?version=${notification.version}`, {
        method: "PATCH", accessToken: session.accessToken
      });
      setFeed((current) => ({
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((value) => value.notificationId === notification.notificationId
          ? { ...value, readAt: new Date().toISOString(), version: value.version + 1 } : value)
      }));
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    if (busy || feed.unreadCount === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest<void>("/api/v1/notifications/read-all", { method: "POST", accessToken: session.accessToken });
      const now = new Date().toISOString();
      setFeed((current) => ({ unreadCount: 0,
        items: current.items.map((value) => value.readAt ? value : { ...value, readAt: now, version: value.version + 1 }) }));
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return <section className="workspace-panel notification-center" aria-labelledby="notification-title">
    <div className="section-heading"><div><p className="eyebrow">Notification center</p><h3 id="notification-title">Thông báo</h3></div>
      <span>{feed.unreadCount} chưa đọc</span></div>
    <div className="button-row"><button className="text-button" type="button" disabled={loading || busy} onClick={() => void load()}>Tải lại</button>
      <button className="secondary-button compact-button" type="button" disabled={busy || feed.unreadCount === 0} onClick={() => void markAllRead()}>Đánh dấu tất cả đã đọc</button></div>
    {loading ? <p className="muted">Đang tải thông báo…</p> : feed.items.length === 0 ? <p className="muted">Chưa có thông báo.</p> : <div className="notification-list">
      {feed.items.map((notification) => <article className={`notification-item ${notification.readAt ? "read" : "unread"}`} key={notification.notificationId}>
        <div><span className="notification-type">{notification.type}</span><h4>{notification.title}</h4><p>{notification.message}</p>
          <small>{new Date(notification.createdAt).toLocaleString("vi-VN")}</small></div>
        {!notification.readAt && <button className="secondary-button compact-button" type="button" disabled={busy} onClick={() => void markRead(notification)}>Đã đọc</button>}
      </article>)}
    </div>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}

