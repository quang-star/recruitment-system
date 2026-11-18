import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { NotificationIcon } from "../../shared/components/Icon";
import { EnsureRouter, useSafeNavigate } from "../../shared/router";
import { Badge, Button, Card, EmptyState, ErrorBanner, Tabs } from "../../shared/ui";
import { NotificationDetailModal } from "./NotificationDetailModal";
import {
  Notification,
  getNotificationTypeInfo,
  isApplicationNotificationType,
  resolveNotificationActionTarget
} from "./notificationPresentation";

export type { Notification } from "./notificationPresentation";

const PAGE_SIZE = 30;

type Feed = {
  items: Notification[];
  unreadCount: number;
  totalCount?: number;
  applicationCount?: number;
  hasMore?: boolean;
};

type TabSlice = {
  items: Notification[];
  hasMore: boolean;
};

type Props = { session: AuthSession; onLogout: () => void };
type TabType = "ALL" | "UNREAD" | "APPLICATIONS";
type MarkReadOutcome = "ok" | "already_handled" | "unauthorized" | "error";

function buildFeedPath(tab: TabType, offset = 0): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (offset > 0) params.set("offset", String(offset));
  if (tab === "UNREAD") params.set("unreadOnly", "true");
  if (tab === "APPLICATIONS") params.set("applicationsOnly", "true");
  return `/api/v2/notifications?${params.toString()}`;
}

function mergeUniqueNotifications(existing: Notification[], incoming: Notification[]): Notification[] {
  const seen = new Set(existing.map((item) => item.notificationId));
  const next = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.notificationId)) {
      seen.add(item.notificationId);
      next.push(item);
    }
  }
  return next;
}

function applyReadUpdate(items: Notification[], notificationId: string, readAt: string): Notification[] {
  return items.map((value) =>
    value.notificationId === notificationId ? { ...value, readAt, version: value.version + 1 } : value
  );
}

function NotificationCenterInner({ session, onLogout }: Props) {
  const navigate = useSafeNavigate();
  const isRecruiter = session.roles.includes("RECRUITER");
  const [feed, setFeed] = useState<Feed>({ items: [], unreadCount: 0 });
  const [unreadSlice, setUnreadSlice] = useState<TabSlice | null>(null);
  const [applicationSlice, setApplicationSlice] = useState<TabSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("ALL");
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const allStaleRef = useRef(false);

  const currentOffsetForTab = useCallback(
    (tab: TabType): number => {
      if (tab === "ALL") return feed.items.length;
      if (tab === "UNREAD") return unreadSlice?.items.length ?? 0;
      return applicationSlice?.items.length ?? 0;
    },
    [applicationSlice, feed.items.length, unreadSlice]
  );

  const loadTab = useCallback(
    async (tab: TabType, append = false) => {
      const offset = append ? currentOffsetForTab(tab) : 0;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await apiRequest<Feed>(buildFeedPath(tab, offset), {
          accessToken: session.accessToken
        });
        const nextHasMore = Boolean(result.hasMore);

        setFeed((current) => ({
          ...current,
          unreadCount: result.unreadCount,
          ...(typeof result.totalCount === "number" ? { totalCount: result.totalCount } : {}),
          ...(typeof result.applicationCount === "number"
            ? { applicationCount: result.applicationCount }
            : {}),
          ...(tab === "ALL"
            ? {
                items: append ? mergeUniqueNotifications(current.items, result.items) : result.items,
                hasMore: nextHasMore
              }
            : {})
        }));

        if (tab === "ALL" && !append) {
          allStaleRef.current = false;
          setUnreadSlice(null);
          setApplicationSlice(null);
        } else if (tab === "UNREAD") {
          setUnreadSlice((current) => ({
            items: append ? mergeUniqueNotifications(current?.items ?? [], result.items) : result.items,
            hasMore: nextHasMore
          }));
          if (!append) {
            allStaleRef.current = true;
            setApplicationSlice(null);
          }
        } else if (tab === "APPLICATIONS") {
          setApplicationSlice((current) => ({
            items: append ? mergeUniqueNotifications(current?.items ?? [], result.items) : result.items,
            hasMore: nextHasMore
          }));
          if (!append) {
            allStaleRef.current = true;
            setUnreadSlice(null);
          }
        }
      } catch (requestError) {
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
        else setError(errorMessage(requestError));
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [currentOffsetForTab, onLogout, session.accessToken]
  );

  useEffect(() => {
    void loadTab("ALL");
    // Initial load runs once per session token / logout handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, onLogout]);

  function selectTab(nextTab: TabType) {
    setActiveTab(nextTab);
    const loadedApplicationCount = feed.items.filter((item) => isApplicationNotificationType(item.type)).length;
    const needsApplicationSlice =
      applicationSlice === null &&
      (Boolean(feed.hasMore) ||
        (typeof feed.applicationCount === "number" && loadedApplicationCount < feed.applicationCount));

    if (nextTab === "ALL" && allStaleRef.current) {
      void loadTab("ALL");
    } else if (nextTab === "UNREAD" && unreadSlice === null) {
      void loadTab("UNREAD");
    } else if (nextTab === "APPLICATIONS" && needsApplicationSlice) {
      void loadTab("APPLICATIONS");
    }
  }

  async function markRead(notification: Notification): Promise<MarkReadOutcome> {
    if (notification.readAt) return "ok";
    if (busy || markingId === notification.notificationId) return "error";
    setMarkingId(notification.notificationId);
    setError(null);
    try {
      await apiRequest<void>(
        `/api/v2/notifications/${notification.notificationId}/read?version=${notification.version}`,
        { method: "PATCH", accessToken: session.accessToken }
      );
      const readAt = new Date().toISOString();
      setFeed((current) => ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: applyReadUpdate(current.items, notification.notificationId, readAt)
      }));
      setUnreadSlice((current) =>
        current
          ? {
              ...current,
              items: current.items.filter((value) => value.notificationId !== notification.notificationId)
            }
          : null
      );
      setApplicationSlice((current) =>
        current
          ? {
              ...current,
              items: applyReadUpdate(current.items, notification.notificationId, readAt)
            }
          : null
      );
      setSelectedNotification((current) =>
        current && current.notificationId === notification.notificationId
          ? { ...current, readAt, version: current.version + 1 }
          : current
      );
      return "ok";
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        onLogout();
        return "unauthorized";
      }
      if (
        requestError instanceof ApiClientError &&
        (requestError.status === 404 || requestError.status === 409)
      ) {
        return "already_handled";
      }
      setError(errorMessage(requestError));
      return "error";
    } finally {
      setMarkingId((current) => (current === notification.notificationId ? null : current));
    }
  }

  async function markAllRead() {
    if (busy || markingId !== null || feed.unreadCount === 0) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest<void>("/api/v2/notifications/read-all", {
        method: "POST",
        accessToken: session.accessToken
      });
      const now = new Date().toISOString();
      const markSliceRead = (items: Notification[]) =>
        items.map((value) => (value.readAt ? value : { ...value, readAt: now, version: value.version + 1 }));
      setFeed((current) => ({
        ...current,
        unreadCount: 0,
        items: markSliceRead(current.items)
      }));
      setUnreadSlice((current) => (current ? { items: [], hasMore: false } : null));
      setApplicationSlice((current) => (current ? { ...current, items: markSliceRead(current.items) } : null));
      setSelectedNotification((current) =>
        current && !current.readAt ? { ...current, readAt: now, version: current.version + 1 } : current
      );
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
      else setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function openNotification(notification: Notification) {
    if (window.getSelection()?.toString()) return;
    if (busy || markingId === notification.notificationId) return;

    const actionTarget = resolveNotificationActionTarget(notification, isRecruiter);
    if (actionTarget) {
      if (!notification.readAt) {
        const outcome = await markRead(notification);
        if (outcome === "unauthorized" || outcome === "error") return;
      }
      navigate(actionTarget.to);
      return;
    }

    setSelectedNotification(notification);
    if (!notification.readAt) {
      void markRead(notification);
    }
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, notification: Notification) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void openNotification(notification);
    }
  }

  const totalCount = feed.totalCount ?? feed.items.length;
  const applicationCount =
    feed.applicationCount ?? feed.items.filter((item) => isApplicationNotificationType(item.type)).length;

  const displayedItems =
    activeTab === "UNREAD"
      ? (unreadSlice?.items ?? feed.items.filter((item) => !item.readAt))
      : activeTab === "APPLICATIONS"
        ? (applicationSlice?.items ?? feed.items.filter((item) => isApplicationNotificationType(item.type)))
        : feed.items;

  const activeHasMore =
    activeTab === "UNREAD"
      ? (unreadSlice?.hasMore ?? false)
      : activeTab === "APPLICATIONS"
        ? (applicationSlice?.hasMore ?? false)
        : Boolean(feed.hasMore);

  const activeTabTotal =
    activeTab === "UNREAD"
      ? feed.unreadCount
      : activeTab === "APPLICATIONS"
        ? applicationCount
        : totalCount;

  return (
    <>
      <Card as="section" padding="lg" className="space-y-5" aria-labelledby="notification-title">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-subtle">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
              Trung tâm thông báo
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
            onChange={selectTab}
            ariaLabel="Lọc thông báo"
            items={[
              { id: "ALL", label: `Tất cả (${totalCount})` },
              { id: "UNREAD", label: `Chưa đọc (${feed.unreadCount})` },
              { id: "APPLICATIONS", label: `Hồ sơ ứng tuyển (${applicationCount})` }
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading || loadingMore || busy || markingId !== null}
              onClick={() => void loadTab(activeTab)}
            >
              Tải lại
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy || markingId !== null || feed.unreadCount === 0}
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
              const typeInfo = getNotificationTypeInfo(notification.type);
              const actionTarget = resolveNotificationActionTarget(notification, isRecruiter);
              const isMarking = markingId === notification.notificationId;
              return (
                <article
                  key={notification.notificationId}
                  role="button"
                  tabIndex={0}
                  aria-disabled={isMarking || undefined}
                  onClick={() => void openNotification(notification)}
                  onKeyDown={(event) => handleCardKeyDown(event, notification)}
                  className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${
                    notification.readAt
                      ? "border-border-subtle bg-white hover:border-brand-300 hover:bg-slate-50/80"
                      : "border-brand-200 bg-brand-50/40 hover:border-brand-400 hover:bg-brand-50/70"
                  } ${isMarking ? "opacity-70" : ""}`}
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
                    <h4 className="text-sm sm:text-base font-bold text-ink-900 m-0 break-words">
                      {notification.title}
                    </h4>
                    <p className="text-sm text-ink-600 m-0 leading-relaxed break-words">
                      {notification.message}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-ink-500">
                      <small>{new Date(notification.createdAt).toLocaleString("vi-VN")}</small>
                      <span className="font-semibold text-brand-700">
                        {isMarking
                          ? "Đang mở…"
                          : actionTarget
                            ? actionTarget.label
                            : "Xem chi tiết →"}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}

            {activeHasMore && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-ink-500 m-0">
                  Đang hiển thị {displayedItems.length} / {activeTabTotal} thông báo
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loadingMore || busy || markingId !== null}
                  loading={loadingMore}
                  onClick={() => void loadTab(activeTab, true)}
                >
                  {loadingMore ? "Đang tải thêm…" : "Xem thêm thông báo"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <NotificationDetailModal
        notification={selectedNotification}
        session={session}
        markingRead={
          selectedNotification !== null &&
          (busy || markingId === selectedNotification.notificationId)
        }
        onClose={() => setSelectedNotification(null)}
        onMarkRead={(item) => void markRead(item)}
        onNavigateToTarget={(targetPath) => navigate(targetPath)}
        onLogout={onLogout}
      />
    </>
  );
}

/** Notification center with read tracking, filtering, detail modal, and direct deep links. */
export function NotificationCenter(props: Props) {
  return (
    <EnsureRouter>
      <NotificationCenterInner {...props} />
    </EnsureRouter>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
