import { routes } from "../../shared/router";

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

export type NotificationTypeInfo = {
  label: string;
  icon: string;
  tone: "brand" | "success" | "warning" | "info" | "neutral";
};

export type NotificationApplicationTarget = {
  applicationId: string;
  audience: "CANDIDATE" | "RECRUITER";
};

export type NotificationActionTarget = {
  to: string;
  label: string;
};

export const APPLICATION_NOTIFICATION_TYPES = [
  "APPLICATION_SUBMITTED",
  "APPLICATION_STATUS_CHANGED",
  "APPLICATION_WITHDRAWN"
] as const;

export function isApplicationNotificationType(type: string): boolean {
  return (APPLICATION_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

export function getNotificationTypeInfo(type: string): NotificationTypeInfo {
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

export function isSafeInternalPath(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
}

export function extractNotificationApplicationTarget(
  linkUrl: string | null | undefined,
  isRecruiter: boolean
): NotificationApplicationTarget | null {
  if (!isSafeInternalPath(linkUrl) || linkUrl === "/") return null;
  try {
    const parsed = new URL(linkUrl, "http://localhost");
    const queryAppId = parsed.searchParams.get("application")?.trim();
    const pathMatch = parsed.pathname.match(/^\/applications\/([^/]+)$/);
    const applicationId = queryAppId || (pathMatch ? decodeURIComponent(pathMatch[1]) : "");
    if (!applicationId) return null;

    const audience: "CANDIDATE" | "RECRUITER" = parsed.pathname.startsWith("/recruiter/")
      ? "RECRUITER"
      : parsed.pathname.startsWith("/candidate/")
        ? "CANDIDATE"
        : isRecruiter
          ? "RECRUITER"
          : "CANDIDATE";

    return { applicationId, audience };
  } catch {
    return null;
  }
}

export function resolveNotificationActionTarget(
  notification: Pick<Notification, "type" | "linkUrl">,
  isRecruiter: boolean
): NotificationActionTarget | null {
  if (isSafeInternalPath(notification.linkUrl) && notification.linkUrl !== "/") {
    if (notification.linkUrl === routes.recruiter.company && notification.type === "COMPANY_INVITATION_ACCEPTED") {
      return { to: `${routes.recruiter.company}?tab=team`, label: "Mở Công ty & Đội ngũ →" };
    }
    if (notification.linkUrl.startsWith(routes.candidate.applications)) {
      return { to: notification.linkUrl, label: "Mở hồ sơ ứng tuyển →" };
    }
    if (notification.linkUrl.startsWith(routes.recruiter.jobs)) {
      return { to: notification.linkUrl, label: "Mở hồ sơ ứng viên →" };
    }
    if (notification.linkUrl.startsWith(routes.recruiter.company)) {
      return { to: notification.linkUrl, label: "Mở Công ty & Đội ngũ →" };
    }
    const legacyAppMatch = notification.linkUrl.match(/^\/applications\/([^/]+)$/);
    if (legacyAppMatch) {
      return isRecruiter
        ? { to: routes.recruiter.applications, label: "Mở danh sách ứng viên →" }
        : {
            to: `${routes.candidate.applications}?application=${encodeURIComponent(decodeURIComponent(legacyAppMatch[1]))}`,
            label: "Mở hồ sơ ứng tuyển →"
          };
    }
    return { to: notification.linkUrl, label: "Đi tới trang liên quan →" };
  }

  if (isRecruiter) {
    if (notification.type === "COMPANY_INVITATION_ACCEPTED") {
      return { to: `${routes.recruiter.company}?tab=team`, label: "Mở Công ty & Đội ngũ →" };
    }
    if (
      notification.type === "APPLICATION_SUBMITTED" ||
      notification.type === "APPLICATION_WITHDRAWN" ||
      notification.type === "MATCHING_COMPLETED"
    ) {
      return { to: routes.recruiter.applications, label: "Mở danh sách ứng viên →" };
    }
    return null;
  }

  if (
    notification.type === "MATCHING_COMPLETED" ||
    notification.type === "APPLICATION_STATUS_CHANGED" ||
    notification.type === "APPLICATION_WITHDRAWN"
  ) {
    return { to: routes.candidate.applications, label: "Mở hồ sơ ứng tuyển →" };
  }
  return null;
}
