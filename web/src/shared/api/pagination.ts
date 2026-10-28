import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "./client";

export type PageResult<T> = { items: T[]; total: number; page: number; size: number };
const emptyItems: never[] = [];

export function usePagedResource<T>(path: string | null, filters: Record<string, string | number | undefined | null>, accessToken?: string, size = 12, urlPage?: { page: number; onChange: (page: number) => void }) {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "" && value !== undefined && value !== null).map(([k, v]) => [k, String(v)])).toString();
  const scope = `${path}?${params}`;
  const [position, setPosition] = useState({ scope, page: 0 });
  const page = urlPage ? Math.max(0, urlPage.page) : position.scope === scope ? position.page : 0;
  const [revision, setRevision] = useState(0);
  const key = `${accessToken ?? ""}|${scope}&page=${page}&size=${size}&revision=${revision}`;
  const [result, setResult] = useState<{ key: string; data?: PageResult<T>; error?: string }>();
  const setPage = (next: number) => urlPage ? urlPage.onChange(Math.max(0, next)) : setPosition({ scope, page: Math.max(0, next) });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void apiRequest<PageResult<T>>(`${path}?${params}&page=${page}&size=${size}`, {
      accessToken, signal: controller.signal
    }).then((data) => {
      if (controller.signal.aborted) return;
      if (page > 0 && data.items.length === 0) {
        setPage(Math.max(0, Math.ceil(data.total / size) - 1));
      } else setResult({ key, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, error: "Không thể tải danh sách. Vui lòng thử lại." });
    });
    return () => controller.abort();
  }, [path, params, page, size, accessToken, revision, key, scope]);

  const current = path && result?.key === key ? result : undefined;
  return { items: current?.data?.items ?? emptyItems, total: current?.data?.total ?? 0,
    page, size, setPage, refresh, loading: !!path && !current, error: current?.error ?? null };
}
