import { useCallback, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

export type Notification = {
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

type TabType = "ALL" | "UNREAD" | "APPLICATIONS";

function getTypeInfo(type: string): { label: string; icon: string; badgeClass: string } {
  switch (type) {
    case "APPLICATION_SUBMITTED":
      return { label: "Hồ sơ mới", icon: "📄", badgeClass: "badge-info" };
    case "APPLICATION_STATUS_CHANGED":
      return { label: "Cập nhật ứng tuyển", icon: "📢", badgeClass: "badge-primary" };
    case "MATCHING_COMPLETED":
      return { label: "Đối sánh AI", icon: "🎯", badgeClass: "badge-success" };
    case "COMPANY_INVITATION_ACCEPTED":
      return { label: "Thành viên mới", icon: "👥", badgeClass: "badge-warning" };
    default:
      return { label: type, icon: "🔔", badgeClass: "badge-neutral" };
  }
}

export function NotificationCenter({ session, onLogout }: Props) {
  const [feed, setFeed] = useState<Feed>({ items: [], unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("ALL");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFeed(await apiRequest<Feed>("/api/v2/notifications?limit=30", { accessToken: session.accessToken }));
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
      await apiRequest<void>(`/api/v2/notifications/${notification.notificationId}/read?version=${notification.version}`, {
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
      await apiRequest<void>("/api/v2/notifications/read-all", { method: "POST", accessToken: session.accessToken });
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

  const appTypes = ["APPLICATION_SUBMITTED", "APPLICATION_STATUS_CHANGED"];
  const applicationCount = feed.items.filter((item) => appTypes.includes(item.type)).length;

  const displayedItems = feed.items.filter((item) => {
    if (activeTab === "UNREAD") return !item.readAt;
    if (activeTab === "APPLICATIONS") return appTypes.includes(item.type);
    return true;
  });

  return (
    <section className="workspace-panel notification-center" aria-labelledby="notification-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Notification center</p>
          <h3 id="notification-title">Thông báo</h3>
        </div>
        <span>{feed.unreadCount} chưa đọc</span>
      </div>

      <div className="button-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <div className="notification-tabs" role="tablist" style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className={`tab-button ${activeTab === "ALL" ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "ALL"}
            onClick={() => setActiveTab("ALL")}
          >
            Tất cả ({feed.items.length})
          </button>
          <button
            className={`tab-button ${activeTab === "UNREAD" ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "UNREAD"}
            onClick={() => setActiveTab("UNREAD")}
          >
            Chưa đọc ({feed.unreadCount})
          </button>
          <button
            className={`tab-button ${activeTab === "APPLICATIONS" ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "APPLICATIONS"}
            onClick={() => setActiveTab("APPLICATIONS")}
          >
            Hồ sơ ứng tuyển ({applicationCount})
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="text-button" type="button" disabled={loading || busy} onClick={() => void load()}>
            Tải lại
          </button>
          <button
            className="secondary-button compact-button"
            type="button"
            disabled={busy || feed.unreadCount === 0}
            onClick={() => void markAllRead()}
          >
            Đánh dấu tất cả đã đọc
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Đang tải thông báo…</p>
      ) : displayedItems.length === 0 ? (
        <p className="muted">
          {activeTab === "UNREAD"
            ? "Không có thông báo chưa đọc nào."
            : activeTab === "APPLICATIONS"
            ? "Chưa có thông báo hồ sơ ứng tuyển."
            : "Chưa có thông báo."}
        </p>
      ) : (
        <div className="notification-list">
          {displayedItems.map((notification) => {
            const typeInfo = getTypeInfo(notification.type);
            return (
              <article
                className={`notification-item ${notification.readAt ? "read" : "unread"}`}
                key={notification.notificationId}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                    <span className={`notification-type ${typeInfo.badgeClass}`}>
                      {typeInfo.icon} {typeInfo.label}
                    </span>
                    {!notification.readAt && (
                      <span
                        className="notification-unread-dot"
                        title="Chưa đọc"
                        style={{
                          display: "inline-block",
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: "var(--color-primary, #2563eb)"
                        }}
                      />
                    )}
                  </div>
                  <h4>{notification.title}</h4>
                  <p>{notification.message}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.35rem" }}>
                    <small>{new Date(notification.createdAt).toLocaleString("vi-VN")}</small>
                    {notification.linkUrl && notification.linkUrl !== "/" && (
                      <a
                        href={notification.linkUrl}
                        className="notification-link"
                        style={{ fontSize: "0.85rem", color: "var(--color-primary, #2563eb)", fontWeight: 500 }}
                        onClick={() => { if (!notification.readAt) void markRead(notification); }}
                      >
                        Xem chi tiết →
                      </a>
                    )}
                  </div>
                </div>
                {!notification.readAt && (
                  <button
                    className="secondary-button compact-button"
                    type="button"
                    disabled={busy}
                    onClick={() => void markRead(notification)}
                  >
                    Đã đọc
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
