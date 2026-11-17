import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { Badge, Button, Card, EmptyState, ErrorBanner, cn } from "../../shared/ui";
import { historyTime, skillCategoryLabel, skillTypeLabel } from "./adminTypes";

type Service = "CORE" | "AI";
type Filters = { actor: string; resourceId: string; action: string; correlationId: string; from: string; to: string };
const emptyFilters: Filters = { actor: "", resourceId: "", action: "", correlationId: "", from: "", to: "" };
const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const businessIdPattern = "[1-9][0-9]{0,18}";
const actions: Record<string, string> = {
  CREATE: "Thêm",
  PROPOSE: "Đề xuất",
  EDIT: "Sửa",
  APPROVE: "Duyệt",
  MERGE: "Gộp",
  REJECT: "Từ chối",
  DEFER: "Tạm hoãn",
  REOPEN: "Mở lại"
};
const legacyMissing = "Chưa được ghi (dữ liệu cũ)";

type AuditEntry = {
  id: string | number;
  resourceId: string;
  action: string;
  actorId?: string;
  actorUserId?: string;
  version: number | null;
  reason: string | null;
  correlationId: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown>;
  beforeState?: string | null;
  afterState?: string;
  createdAt?: string;
  occurredAt?: string;
  redacted?: boolean;
};
type AuditPage = { items: AuditEntry[]; total: number; page: number; size: number };

const fieldClass =
  "mt-1 h-9 w-full rounded-xl border border-border-strong bg-white px-3 text-xs font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function AdminAuditPanel({ accessToken }: { accessToken: string }) {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [service, setService] = useState<Service>("CORE");
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selectedEntry = result?.items.find((item) => item.id === selectedId) ?? result?.items[0];

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    const query = new URLSearchParams({ page: String(page), size: "20" });
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        const parameter = key === "actor" ? (service === "CORE" ? "actorUserId" : "actorId") : key;
        query.set(parameter, key === "from" || key === "to" ? new Date(value).toISOString() : value);
      }
    }
    const endpoint = service === "CORE" ? "/api/v2/dashboard/catalog/history" : "/api/v2/taxonomy/skills/history";
    void apiRequest<AuditPage>(`${endpoint}?${query}`, { accessToken })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : "Không tải được nhật ký");
      });
    return () => {
      active = false;
    };
  }, [service, filters, page, attempt, accessToken]);

  function filter(event: FormEvent) {
    event.preventDefault();
    if ([draft.from, draft.to].some((value) => value && !Number.isFinite(new Date(value).getTime()))) {
      setError("Thời điểm tìm kiếm không hợp lệ.");
      return;
    }
    if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
      setError("Thời điểm bắt đầu phải trước hoặc bằng thời điểm kết thúc.");
      return;
    }
    setFilters({
      ...draft,
      actor: draft.actor.trim(),
      resourceId: draft.resourceId.trim(),
      correlationId: draft.correlationId.trim()
    });
    setPage(0);
  }

  function field(key: keyof Filters, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <Card as="section" padding="md" className="space-y-5" aria-label="Tra cứu nhật ký">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <h2 className="text-lg font-bold text-ink-900 m-0">Tra cứu nhật ký</h2>
          <p className="text-xs text-ink-600 m-0 mt-0.5">Chọn danh mục nghề hoặc kỹ năng để tìm lịch sử tương ứng.</p>
        </div>

        <div className="flex flex-wrap items-end gap-2.5">
          <label className="block text-xs font-semibold text-ink-700">
            Nguồn nhật ký
            <select
              aria-label="Nguồn nhật ký"
              className={fieldClass}
              value={service}
              onChange={(event) => {
                setService(event.target.value as Service);
                setDraft(emptyFilters);
                setFilters(emptyFilters);
                setPage(0);
              }}
            >
              <option value="CORE">Danh mục nghề (Core)</option>
              <option value="AI">Kỹ năng (AI)</option>
            </select>
          </label>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            Làm mới nhật ký
          </Button>
        </div>
      </div>

      <form
        className="space-y-3 rounded-xl border border-border-subtle bg-slate-50/70 p-4"
        onSubmit={filter}
        aria-label="Bộ lọc nhật ký"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-semibold text-ink-700">
            ID người thực hiện
            <input
              className={fieldClass}
              maxLength={19}
              inputMode="numeric"
              pattern={businessIdPattern}
              value={draft.actor}
              onChange={(event) => field("actor", event.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            ID danh mục / kỹ năng
            <input
              className={fieldClass}
              maxLength={19}
              inputMode="numeric"
              pattern={businessIdPattern}
              value={draft.resourceId}
              onChange={(event) => field("resourceId", event.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            Hành động nhật ký
            <select
              aria-label="Hành động nhật ký"
              className={fieldClass}
              value={draft.action}
              onChange={(event) => field("action", event.target.value)}
            >
              <option value="">Tất cả hành động</option>
              {Object.entries(actions).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            Mã tương quan nhật ký
            <input
              className={fieldClass}
              maxLength={36}
              pattern={uuidPattern}
              value={draft.correlationId}
              onChange={(event) => field("correlationId", event.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            Thời gian từ (giờ địa phương)
            <input
              className={fieldClass}
              type="datetime-local"
              value={draft.from}
              onChange={(event) => field("from", event.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            Thời gian đến (giờ địa phương)
            <input
              className={fieldClass}
              type="datetime-local"
              value={draft.to}
              onChange={(event) => field("to", event.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" variant="primary" size="sm">
            Tìm nhật ký
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setDraft(emptyFilters);
              setFilters(emptyFilters);
              setPage(0);
            }}
          >
            Xóa bộ lọc nhật ký
          </Button>
        </div>
      </form>

      {error && <ErrorBanner tone="error" message={error} />}
      {!result && !error && (
        <p role="status" className="text-sm text-ink-500 m-0">
          Đang tải nhật ký…
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink-600 m-0 tabular-nums-kpi">
              {result.total} thay đổi · Trang {result.page + 1} ·{" "}
              {service === "CORE" ? "Danh mục nghề (Core)" : "Kỹ năng (AI)"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={result.page === 0} onClick={() => setPage((v) => v - 1)}>
                Trang nhật ký trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={result.page >= 100000 || (result.page + 1) * result.size >= result.total}
                onClick={() => setPage((v) => v + 1)}
              >
                Trang nhật ký sau
              </Button>
            </div>
          </div>

          {result.items.length ? (
            <div className="grid gap-5 items-start lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <div className="min-w-0 max-h-[540px] overflow-auto rounded-xl border border-border-subtle bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Các thay đổi được ghi nhận</caption>
                  <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_var(--color-border-subtle)]">
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                      <th className="px-4 py-2.5">Hành động</th>
                      <th className="px-3 py-2.5">Danh mục / kỹ năng</th>
                      <th className="px-4 py-2.5">Thời điểm</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {result.items.map((item) => {
                      const isSelected = selectedEntry?.id === item.id;
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            "transition-colors hover:bg-slate-50/80",
                            isSelected && "bg-brand-50/50 border-l-4 border-l-brand-600"
                          )}
                        >
                          <td className="px-4 py-2.5 align-top">
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => setSelectedId(item.id)}
                              className="text-xs font-bold text-brand-700 hover:underline cursor-pointer"
                            >
                              {actions[item.action] ?? item.action}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 align-top text-sm font-medium text-ink-900 break-words">
                            <span className="block">{name(state(item.after ?? item.afterState))}</span>
                            <span className="mt-0.5 block font-mono text-[11px] text-ink-500">#{item.resourceId}</span>
                          </td>
                          <td className="px-4 py-2.5 align-top text-xs text-ink-600 whitespace-nowrap">
                            {historyTime(item.createdAt ?? item.occurredAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ol className="pl-0 list-none m-0">
                {selectedEntry && <AuditRecord key={selectedEntry.id} item={selectedEntry} service={service} />}
              </ol>
            </div>
          ) : (
            <EmptyState title="Không có thay đổi phù hợp bộ lọc." />
          )}
        </div>
      )}
    </Card>
  );
}

function AuditRecord({ item, service }: { item: AuditEntry; service: Service }) {
  const before = state(item.before ?? item.beforeState);
  const after = state(item.after ?? item.afterState);
  const occurred = item.createdAt ?? item.occurredAt;
  const date = occurred ? new Date(occurred) : null;
  return (
    <li className="rounded-2xl border border-border-subtle bg-slate-50/70 p-4 space-y-3 break-words">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
        <Badge tone="brand">{actions[item.action] ?? item.action}</Badge>
        <p className="text-xs text-ink-500 m-0">
          {date && !Number.isNaN(date.getTime()) ? date.toLocaleString("vi-VN") : legacyMissing}
        </p>
      </div>
      <dl className="grid gap-2 text-xs m-0">
        <div>
          <dt className="font-semibold text-ink-500">ID danh mục / kỹ năng</dt>
          <dd className="m-0 font-mono text-ink-900">{item.resourceId}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Người thực hiện</dt>
          <dd className="m-0 font-mono text-ink-900">
            {(service === "CORE" ? item.actorUserId : item.actorId) ?? legacyMissing}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Phiên bản</dt>
          <dd className="m-0 text-ink-900">{item.version ?? legacyMissing}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Lý do</dt>
          <dd className="m-0 text-ink-900">{item.reason ?? legacyMissing}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Mã tương quan</dt>
          <dd className="m-0 font-mono text-ink-800">{item.correlationId ?? legacyMissing}</dd>
        </div>
      </dl>
      <p className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-xs font-medium text-ink-900 m-0">
        {name(before)} → {name(after)}
        {typeof after?.status === "string" ? ` · ${after.status}` : ""}
      </p>
      {typeof after?.type === "string" && (
        <p className="text-xs text-ink-700 m-0">
          Loại: {skillTypeLabel[after.type] ?? after.type}
          {typeof after.category === "string" ? ` · Nhóm: ${skillCategoryLabel[after.category] ?? after.category}` : ""}
        </p>
      )}
      {Array.isArray(after?.aliases) && (
        <p className="text-xs text-ink-600 m-0">
          Tên gọi khác:{" "}
          {after.aliases
            .map((alias: unknown) => (typeof alias === "object" && alias !== null && "value" in alias ? String(alias.value) : ""))
            .filter(Boolean)
            .join(", ") || "Không có"}
        </p>
      )}
      {service === "AI" && item.redacted && (
        <p className="text-xs font-medium text-amber-800 m-0">Thông tin liên hệ đã được che trong bản ghi này.</p>
      )}
    </li>
  );
}

function name(value: Record<string, unknown> | null): string {
  const label = value?.name ?? value?.canonicalName;
  return typeof label === "string" ? label : legacyMissing;
}

function state(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> | null {
  if (typeof value !== "string") return value ?? null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
