import { useCallback, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { NotificationIcon } from "../../shared/components/Icon";
import { Badge, Button, Card, EmptyState, ErrorBanner, Tabs } from "../../shared/ui";

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

type Feed = { items: Notification[]; unreadCount: number };
type Props = { session: AuthSession; onLogout: () => void };

type TabType = "ALL" | "UNREAD" | "APPLICATIONS";

function getTypeInfo(type: string): {
  label: string;
  icon: string;
  tone: "brand" | "success" | "warning" | "info" | "neutral";
} {
  switch (type) {
    case "APPLICATION_SUBMITTED":
      return { label: "Hồ sơ mới", icon: "📄", tone: "info" };
    case "APPLICATION_STATUS_CHANGED":
      return { label: "Cập nhật ứng tuyển", icon: "📢", tone: "brand" };
    case "APPLICATION_WITHDRAWN":
      return { label: "Đã rút hồ sơ", icon: "📄", tone: "neutral" };
    case "MATCHING_COMPLETED":
      return { label: "Đối sánh AI", icon: "🎯", tone: "success" };
    case "COMPANY_INVITATION_ACCEPTED":
      return { label: "Thành viên mới", icon: "👥", tone: "warning" };
    default:
      return { label: type, icon: "🔔", tone: "neutral" };
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

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(notification: Notification) {
    if (busy || notification.readAt) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest<void>(
        `/api/v2/notifications/${notification.notificationId}/read?version=${notification.version}`,
        { method: "PATCH", accessToken: session.accessToken }
      );
      setFeed((current) => ({
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((value) =>
          value.notificationId === notification.notificationId
            ? { ...value, readAt: new Date().toISOString(), version: value.version + 1 }
            : value
        )
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
      await apiRequest<void>("/api/v2/notifications/read-all", {
        method: "POST",
        accessToken: session.accessToken
      });
      const now = new Date().toISOString();
      setFeed((current) => ({
        unreadCount: 0,
        items: current.items.map((value) =>
          value.readAt ? value : { ...value, readAt: now, version: value.version + 1 }
        )
      }));
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
    <Card as="section" padding="lg" className="space-y-5" aria-labelledby="notification-title">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-subtle">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
            Notification center
          </p>
          <h3 id="notification-title" className="text-xl font-bold text-ink-900 m-0 mt-0.5">
            Thông báo
          </h3>
        </div>
        <Badge tone={feed.unreadCount > 0 ? "brand" : "neutral"}>{feed.unreadCount} chưa đọc</Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<TabType>
          activeId={activeTab}
          onChange={setActiveTab}
          ariaLabel="Lọc thông báo"
          items={[
            { id: "ALL", label: `Tất cả (${feed.items.length})` },
            { id: "UNREAD", label: `Chưa đọc (${feed.unreadCount})` },
            { id: "APPLICATIONS", label: `Hồ sơ ứng tuyển (${applicationCount})` }
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            Tải lại
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy || feed.unreadCount === 0}
            onClick={() => void markAllRead()}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        </div>
      </div>

      {error && <ErrorBanner tone="error" message={error} />}

      {loading ? (
        <p className="text-sm text-ink-500 py-6 text-center m-0">Đang tải thông báo…</p>
      ) : displayedItems.length === 0 ? (
        <EmptyState
          icon={<NotificationIcon size={22} />}
          title={
            activeTab === "UNREAD"
              ? "Không có thông báo chưa đọc nào."
              : activeTab === "APPLICATIONS"
                ? "Chưa có thông báo hồ sơ ứng tuyển."
                : "Chưa có thông báo."
          }
          description="Mọi cập nhật về hồ sơ ứng tuyển và phân tích CV sẽ hiển thị tại đây."
        />
      ) : (
        <div className="space-y-3">
          {displayedItems.map((notification) => {
            const typeInfo = getTypeInfo(notification.type);
            return (
              <article
                key={notification.notificationId}
                className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-colors ${
                  notification.readAt
                    ? "border-border-subtle bg-white"
                    : "border-brand-200 bg-brand-50/40"
                }`}
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={typeInfo.tone}>
                      <span>
                        {typeInfo.icon} {typeInfo.label}
                      </span>
                    </Badge>
                    {!notification.readAt && (
                      <span
                        title="Chưa đọc"
                        className="inline-block h-2 w-2 rounded-full bg-brand-600"
                      />
                    )}
                  </div>
                  <h4 className="text-sm sm:text-base font-bold text-ink-900 m-0">
                    {notification.title}
                  </h4>
                  <p className="text-sm text-ink-600 m-0 leading-relaxed">{notification.message}</p>
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-ink-500">
                    <small>{new Date(notification.createdAt).toLocaleString("vi-VN")}</small>
                    {notification.linkUrl && notification.linkUrl !== "/" && (
                      <a
                        href={notification.linkUrl}
                        className="font-semibold text-brand-700 hover:text-brand-800 no-underline"
                        onClick={() => {
                          if (!notification.readAt) void markRead(notification);
                        }}
                      >
                        Xem chi tiết →
                      </a>
                    )}
                  </div>
                </div>

                {!notification.readAt && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void markRead(notification)}
                  >
                    Đã đọc
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
