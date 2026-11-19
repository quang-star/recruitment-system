import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../shared/api/client";

export type AdminUserSummary = {
  userId: string;
  email: string;
  roles: string[];
  status: string;
};

const roleLabels: Record<string, string> = {
  SYSTEM_ADMIN: "Quản trị viên",
  RECRUITER: "Nhà tuyển dụng",
  CANDIDATE: "Ứng viên"
};

const numericIdPattern = /^[1-9][0-9]{0,18}$/;

export function formatAdminUserRole(roles: string[]): string | null {
  if (!roles.length) return null;
  return roles.map((role) => roleLabels[role] ?? role).join(", ");
}

/** Batch-resolves numeric user IDs to account summaries for admin audit views. */
export function useAdminUserLookup(
  ids: Array<string | null | undefined>,
  accessToken: string
): Record<string, AdminUserSummary> {
  const [usersById, setUsersById] = useState<Record<string, AdminUserSummary>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  const uniqueIds = useMemo(() => {
    const set = new Set<string>();
    for (const raw of ids) {
      const trimmed = raw?.trim();
      if (trimmed && numericIdPattern.test(trimmed)) set.add(trimmed);
    }
    return [...set];
  }, [ids]);

  const missingKey = useMemo(
    () => uniqueIds.filter((id) => !usersById[id] && !requestedRef.current.has(id)).slice(0, 50).join(","),
    [uniqueIds, usersById]
  );

  useEffect(() => {
    requestedRef.current.clear();
    setUsersById({});
  }, [accessToken]);

  useEffect(() => {
    if (!missingKey) return;
    const batch = missingKey.split(",");
    for (const id of batch) requestedRef.current.add(id);
    const controller = new AbortController();
    void apiRequest<AdminUserSummary[]>(`/api/v2/auth/admin/users?ids=${encodeURIComponent(missingKey)}`, {
      accessToken,
      signal: controller.signal
    })
      .then((items) => {
        if (controller.signal.aborted || !Array.isArray(items) || items.length === 0) return;
        setUsersById((current) => {
          const next = { ...current };
          for (const item of items) {
            if (item && typeof item.userId === "string" && typeof item.email === "string") {
              next[item.userId] = item;
            }
          }
          return next;
        });
      })
      .catch(() => {
        // Non-blocking enrichment: keep numeric ID fallback when lookup is unavailable.
      });
    return () => controller.abort();
  }, [missingKey, accessToken]);

  return usersById;
}
