import { useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { Badge, Button, ErrorBanner, Modal, Skeleton } from "../../shared/ui";
import { ApplicationMatch, MatchBreakdown } from "../application/MatchBreakdown";
import { MatchState } from "../application/matchPresentation";
import {
  Application,
  StatusChange,
  applicationStatusLabel,
  applicationStatusTone
} from "../candidate/candidateJobTypes";
import {
  Notification,
  extractNotificationApplicationTarget,
  getNotificationTypeInfo,
  resolveNotificationActionTarget
} from "./notificationPresentation";

type ApplicationDetail = Application & {
  candidateName?: string | null;
  candidateHeadline?: string | null;
  coverLetter?: string | null;
};

type Props = {
  notification: Notification | null;
  session: AuthSession;
  markingRead: boolean;
  onClose: () => void;
  onMarkRead: (notification: Notification) => void;
  onNavigateToTarget: (targetPath: string) => void;
  onLogout: () => void;
};

export function NotificationDetailModal({
  notification,
  session,
  markingRead,
  onClose,
  onMarkRead,
  onNavigateToTarget,
  onLogout
}: Props) {
  const isRecruiter = session.roles.includes("RECRUITER");
  const applicationTarget = notification
    ? extractNotificationApplicationTarget(notification.linkUrl, isRecruiter)
    : null;
  const actionTarget = notification ? resolveNotificationActionTarget(notification, isRecruiter) : null;

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [match, setMatch] = useState<ApplicationMatch | null>(null);
  const [matchState, setMatchState] = useState<MatchState>("waiting");
  const [history, setHistory] = useState<StatusChange[]>([]);
  const [detailAttempt, setDetailAttempt] = useState(0);

  const notificationId = notification?.notificationId ?? null;
  const targetAppId = applicationTarget?.applicationId ?? null;
  const targetAudience = applicationTarget?.audience ?? null;

  useEffect(() => {
    if (!notificationId || !targetAppId || !targetAudience) {
      setDetailLoading(false);
      setDetailError(null);
      setApplication(null);
      setMatch(null);
      setMatchState("waiting");
      setHistory([]);
      return;
    }

    const controller = new AbortController();
    const applicationPath =
      targetAudience === "RECRUITER"
        ? `/api/v2/recruiter/applications/${encodeURIComponent(targetAppId)}`
        : `/api/v2/candidate/applications/${encodeURIComponent(targetAppId)}`;

    setDetailLoading(true);
    setDetailError(null);
    setApplication(null);
    setMatch(null);
    setMatchState("waiting");
    setHistory([]);

    void (async () => {
      try {
        const [appResult, historyResult] = await Promise.all([
          apiRequest<ApplicationDetail>(applicationPath, {
            accessToken: session.accessToken,
            signal: controller.signal
          }),
          apiRequest<StatusChange[]>(`/api/v2/applications/${encodeURIComponent(targetAppId)}/history`, {
            accessToken: session.accessToken,
            signal: controller.signal
          }).catch(() => [] as StatusChange[])
        ]);
        if (controller.signal.aborted) return;
        setApplication(appResult);
        setHistory(Array.isArray(historyResult) ? historyResult : []);

        if (appResult.matchingSupported === false || appResult.cvAccessGranted === false) {
          return;
        }

        setMatchState("loading");
        try {
          const matchResult = await apiRequest<ApplicationMatch>(
            `/api/v2/applications/${encodeURIComponent(targetAppId)}/match`,
            { accessToken: session.accessToken, signal: controller.signal }
          );
          if (controller.signal.aborted) return;
          setMatch(matchResult);
          setMatchState("ready");
        } catch (matchError) {
          if (controller.signal.aborted) return;
          if (matchError instanceof ApiClientError && matchError.status === 401) {
            onLogout();
            return;
          }
          setMatch(null);
          setMatchState(
            matchError instanceof ApiClientError && matchError.status === 404 ? "waiting" : "error"
          );
        }
      } catch (requestError) {
        if (controller.signal.aborted) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) {
          onLogout();
          return;
        }
        setDetailError(
          requestError instanceof ApiClientError
            ? requestError.error.message
            : "Không tải được thông tin hồ sơ liên quan."
        );
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [notificationId, targetAppId, targetAudience, detailAttempt, session.accessToken, onLogout]);

  const typeInfo = notification ? getNotificationTypeInfo(notification.type) : null;

  return (
    <Modal
      open={notification !== null}
      onClose={onClose}
      eyebrow="Chi tiết thông báo"
      title={notification?.title}
      size="lg"
    >
      {notification && typeInfo && (
        <div className="pt-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={typeInfo.tone}>
                <span>
                  {typeInfo.icon} {typeInfo.label}
                </span>
              </Badge>
              <Badge tone={notification.readAt ? "neutral" : "brand"}>
                {notification.readAt ? "Đã đọc" : "Chưa đọc"}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
              <span>Nhận lúc: {new Date(notification.createdAt).toLocaleString("vi-VN")}</span>
              {notification.readAt && (
                <span>Đã đọc lúc: {new Date(notification.readAt).toLocaleString("vi-VN")}</span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border-subtle bg-slate-50/70 p-4">
            <p className="text-sm text-ink-800 m-0 leading-relaxed whitespace-pre-line">
              {notification.message}
            </p>
          </div>

          {applicationTarget ? (
            <section className="space-y-4" aria-label="Thông tin hồ sơ liên quan">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500 m-0">
                  Hồ sơ ứng tuyển liên quan
                </h3>
                <span className="text-xs text-ink-400">Mã hồ sơ #{applicationTarget.applicationId}</span>
              </div>

              {detailLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-28" />
                </div>
              ) : detailError ? (
                <ErrorBanner
                  tone="warning"
                  message={detailError}
                  action={
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setDetailAttempt((value) => value + 1)}
                    >
                      Thử lại
                    </Button>
                  }
                />
              ) : application ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border-subtle bg-white p-4 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <strong className="block text-base font-bold text-ink-900 break-words">
                          {application.jobTitle || `Vị trí #${application.jobId}`}
                        </strong>
                        <p className="text-xs text-ink-500 m-0">
                          {targetAudience === "RECRUITER"
                            ? `${application.candidateName || `Ứng viên #${application.applicationId}`}${
                                application.candidateHeadline ? ` · ${application.candidateHeadline}` : ""
                              } · `
                            : application.companyName
                              ? `${application.companyName} · `
                              : ""}
                          Nộp ngày {new Date(application.appliedAt).toLocaleString("vi-VN")}
                        </p>
                      </div>
                      <Badge tone={applicationStatusTone(application.status)}>
                        {applicationStatusLabel(application.status)}
                      </Badge>
                    </div>
                  </div>

                  {application.cvAccessGranted === false ? (
                    <div className="rounded-lg border border-border-subtle bg-slate-50 px-4 py-3 text-xs sm:text-sm text-ink-600">
                      {application.status === "REJECTED"
                        ? "Hồ sơ đã bị từ chối nên quyền xem CV và kết quả đối sánh đã đóng."
                        : application.status === "WITHDRAWN"
                          ? "Hồ sơ đã được rút; quyền xem CV và kết quả đối sánh đã thu hồi."
                          : "Quyền chia sẻ CV đã được thu hồi nên kết quả đối sánh không còn hiển thị."}
                    </div>
                  ) : application.matchingSupported === false ? (
                    <div className="rounded-lg border border-border-subtle bg-slate-50 px-4 py-3 text-xs sm:text-sm text-ink-600">
                      Vị trí này áp dụng quy trình xem xét hồ sơ thủ công (không chấm điểm AI).
                    </div>
                  ) : matchState === "loading" ? (
                    <p className="text-xs text-ink-500 m-0">Đang tải kết quả đối sánh…</p>
                  ) : match ? (
                    <MatchBreakdown match={match} />
                  ) : matchState === "waiting" ? (
                    <div className="rounded-lg border border-border-subtle bg-slate-50 px-4 py-3 text-xs sm:text-sm text-ink-600">
                      Kết quả đối sánh đang được xử lý hoặc chưa khả dụng.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border-subtle bg-slate-50 px-4 py-3 text-xs sm:text-sm text-ink-600">
                      Không thể tải kết quả đối sánh ngay lúc này.
                    </div>
                  )}

                  {history.length > 0 && (
                    <div className="rounded-lg border border-border-subtle bg-white p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-500 m-0 mb-2.5">
                        Lịch sử trạng thái
                      </p>
                      <ol className="status-timeline space-y-2 border-l-2 border-brand-200 pl-4 m-0 list-none">
                        {history.map((change) => (
                          <li key={change.statusChangeId} className="text-xs text-ink-700 space-y-0.5">
                            <div className="font-semibold text-ink-900">
                              {change.fromStatus ? `${applicationStatusLabel(change.fromStatus)} → ` : ""}
                              {applicationStatusLabel(change.toStatus)}
                            </div>
                            <div className="text-ink-500">
                              {new Date(change.occurredAt).toLocaleString("vi-VN")}
                              {change.reason ? ` · Lý do: ${change.reason}` : ""}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : (
            <div className="rounded-lg border border-border-subtle bg-slate-50/70 px-4 py-3 text-xs sm:text-sm text-ink-600">
              {notification.type === "COMPANY_INVITATION_ACCEPTED"
                ? "Thành viên mới đã chấp nhận lời mời tham gia công ty. Mở trang Công ty & Đội ngũ để xem danh sách thành viên và vai trò."
                : !notification.linkUrl || notification.linkUrl === "/"
                  ? "Thông báo này chưa gắn mã hồ sơ trực tiếp. Bạn có thể mở danh sách hồ sơ để kiểm tra trạng thái và kết quả mới nhất."
                  : "Nhấn nút bên dưới để chuyển tới trang liên quan tới thông báo này."}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border-subtle">
            <div>
              {!notification.readAt && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={markingRead}
                  onClick={() => onMarkRead(notification)}
                >
                  Đánh dấu đã đọc
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Đóng
              </Button>
              {actionTarget && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    onClose();
                    onNavigateToTarget(actionTarget.to);
                  }}
                >
                  {actionTarget.label}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
