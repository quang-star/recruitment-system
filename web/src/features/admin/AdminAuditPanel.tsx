import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { Badge, Button, Card, EmptyState, ErrorBanner, Modal, cn } from "../../shared/ui";
import { catalogStatusLabel, historyTime, skillCategoryLabel, skillTypeLabel } from "./adminTypes";
import { AdminUserSummary, formatAdminUserRole, useAdminUserLookup } from "./useAdminUserLookup";

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
  "mt-1 h-9 w-full rounded-md border border-border-strong bg-white px-3 text-xs font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function AdminAuditPanel({ accessToken }: { accessToken: string }) {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [service, setService] = useState<Service>("CORE");
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const selectedEntry = result?.items.find((item) => item.id === selectedId) ?? null;
  const actorIds = (result?.items ?? []).map((item) => (service === "CORE" ? item.actorUserId : item.actorId));
  const usersById = useAdminUserLookup(actorIds, accessToken);

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
    setSelectedId(null);
    setPage(0);
  }

  function applyQuickFilter(patch: Partial<Filters>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setFilters({
      ...next,
      actor: next.actor.trim(),
      resourceId: next.resourceId.trim(),
      correlationId: next.correlationId.trim()
    });
    setSelectedId(null);
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
                setSelectedId(null);
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
        className="space-y-3 rounded-lg border border-border-subtle bg-slate-50/70 p-4"
        onSubmit={filter}
        aria-label="Bộ lọc nhật ký"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs font-semibold text-ink-700">
            ID người thực hiện
            <input
              className={fieldClass}
              placeholder="Ví dụ: 7"
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
              placeholder="Ví dụ: 60"
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
              placeholder="UUID, ví dụ: c75866ba-..."
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
              setSelectedId(null);
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
          {result.items.length ? (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Các thay đổi được ghi nhận</caption>
                <thead className="bg-slate-50/90 border-b border-border-subtle">
                  <tr className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th className="w-28 px-4 py-2.5 whitespace-nowrap">Hành động</th>
                    <th className="px-3 py-2.5">Danh mục / kỹ năng</th>
                    <th className="w-36 px-3 py-2.5 whitespace-nowrap">Người thực hiện</th>
                    <th className="px-3 py-2.5">Lý do</th>
                    <th className="w-36 px-3 py-2.5 whitespace-nowrap">Thời điểm</th>
                    <th className="w-28 px-4 py-2.5 text-right whitespace-nowrap">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {result.items.map((item) => {
                    const isSelected = selectedEntry?.id === item.id;
                    const after = state(item.after ?? item.afterState);
                    const actor = service === "CORE" ? item.actorUserId : item.actorId;
                    const actorUser = actor ? usersById[actor] : undefined;
                    const actorRole = actorUser ? formatAdminUserRole(actorUser.roles) : null;
                    const afterStatus = typeof after?.status === "string" ? (catalogStatusLabel[after.status] ?? after.status) : null;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          "transition-colors hover:bg-slate-50/80 cursor-pointer",
                          isSelected && "bg-brand-50/50"
                        )}
                      >
                        <td className="px-4 py-3 align-middle">
                          <Badge tone="brand">{actions[item.action] ?? item.action}</Badge>
                        </td>
                        <td className="px-3 py-3 align-middle text-sm font-medium text-ink-900 break-words">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{name(after)}</span>
                            {afterStatus && <Badge tone="neutral">{afterStatus}</Badge>}
                          </div>
                          <span className="mt-0.5 block font-mono text-xs text-ink-500">#{item.resourceId}</span>
                        </td>
                        <td className="px-3 py-3 align-middle text-xs text-ink-700">
                          {actorUser ? (
                            <>
                              <span className="block font-medium text-ink-900 break-all">{actorUser.email}</span>
                              <span className="block text-ink-500">
                                #{actor}{actorRole ? ` · ${actorRole}` : ""} · {item.version !== null ? `Phiên bản ${item.version}` : legacyMissing}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="block font-mono">{actor ? `#${actor}` : legacyMissing}</span>
                              <span className="block text-ink-500">{item.version !== null ? `Phiên bản ${item.version}` : legacyMissing}</span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3 align-middle text-xs text-ink-700 max-w-xs">
                          <p className="m-0 line-clamp-2 break-words">{item.reason ?? legacyMissing}</p>
                        </td>
                        <td className="px-3 py-3 align-middle text-xs text-ink-600 whitespace-nowrap">
                          {historyTime(item.createdAt ?? item.occurredAt)}
                        </td>
                        <td className="px-4 py-3 align-middle text-right" onClick={(event) => event.stopPropagation()}>
                          <Button
                            size="sm"
                            variant={isSelected ? "primary" : "secondary"}
                            aria-label={`Xem chi tiết ${name(after)} #${item.resourceId}`}
                            aria-pressed={isSelected}
                            onClick={() => setSelectedId(item.id)}
                          >
                            Xem chi tiết
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Không có thay đổi phù hợp bộ lọc." />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle/80 pt-4">
            <p className="text-xs font-semibold text-ink-600 m-0 tabular-nums-kpi">
              {result.total} thay đổi · Trang {result.page + 1} ·{" "}
              {service === "CORE" ? "Danh mục nghề (Core)" : "Kỹ năng (AI)"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={result.page === 0} onClick={() => { setSelectedId(null); setPage((v) => v - 1); }}>
                Trang nhật ký trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={result.page >= 100000 || (result.page + 1) * result.size >= result.total}
                onClick={() => { setSelectedId(null); setPage((v) => v + 1); }}
              >
                Trang nhật ký sau
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedId(null)}
        size="lg"
        title={selectedEntry ? `${actions[selectedEntry.action] ?? selectedEntry.action} · ${name(state(selectedEntry.after ?? selectedEntry.afterState))}` : undefined}
        description={selectedEntry ? `ID danh mục / kỹ năng: #${selectedEntry.resourceId} · ${service === "CORE" ? "Danh mục nghề (Core)" : "Kỹ năng (AI)"}` : undefined}
      >
        {selectedEntry && (
          <div className="pt-4">
            <AuditRecord
              key={selectedEntry.id}
              item={selectedEntry}
              service={service}
              actorUser={(() => {
                const actor = service === "CORE" ? selectedEntry.actorUserId : selectedEntry.actorId;
                return actor ? usersById[actor] : undefined;
              })()}
              onFilterResource={(id) => applyQuickFilter({ resourceId: id })}
              onFilterCorrelation={(corr) => applyQuickFilter({ correlationId: corr })}
            />
          </div>
        )}
      </Modal>
    </Card>
  );
}

function AuditRecord({
  item,
  service,
  actorUser,
  onFilterResource,
  onFilterCorrelation
}: {
  item: AuditEntry;
  service: Service;
  actorUser?: AdminUserSummary;
  onFilterResource: (resourceId: string) => void;
  onFilterCorrelation: (correlationId: string) => void;
}) {
  const before = state(item.before ?? item.beforeState);
  const after = state(item.after ?? item.afterState);
  const occurred = item.createdAt ?? item.occurredAt;
  const date = occurred ? new Date(occurred) : null;
  const isInitial = !before && (item.action === "CREATE" || item.action === "PROPOSE");
  const beforeLabel = isInitial ? "Khởi tạo" : name(before);
  const afterStatus = typeof after?.status === "string" ? (catalogStatusLabel[after.status] ?? after.status) : null;
  const actor = service === "CORE" ? item.actorUserId : item.actorId;
  const actorRole = actorUser ? formatAdminUserRole(actorUser.roles) : null;
  return (
    <div className="rounded-lg border border-border-subtle bg-slate-50/70 p-4 space-y-3 break-words">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
        <Badge tone="brand">{actions[item.action] ?? item.action}</Badge>
        <p className="text-xs text-ink-500 m-0">
          {date && !Number.isNaN(date.getTime()) ? date.toLocaleString("vi-VN") : legacyMissing}
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 text-xs m-0">
        <div>
          <dt className="font-semibold text-ink-500">ID danh mục / kỹ năng</dt>
          <dd className="m-0 mt-0.5 flex flex-wrap items-center gap-2 font-mono text-ink-900">
            <span>{item.resourceId}</span>
            <button
              type="button"
              onClick={() => onFilterResource(item.resourceId)}
              className="font-sans text-[11px] font-semibold text-brand-700 hover:underline cursor-pointer"
            >
              Lọc ID này
            </button>
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Người thực hiện</dt>
          <dd className="m-0 mt-0.5 text-ink-900">
            {actorUser ? (
              <span>
                <span className="font-medium">{actorUser.email}</span>{" "}
                <span className="font-mono text-ink-600">(#{actor})</span>
                {actorRole ? <span className="text-ink-500"> · {actorRole}</span> : null}
              </span>
            ) : (
              <span className="font-mono">{actor ?? legacyMissing}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Phiên bản</dt>
          <dd className="m-0 mt-0.5 text-ink-900">{item.version ?? legacyMissing}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-500">Lý do</dt>
          <dd className="m-0 mt-0.5 text-ink-900">{item.reason ?? legacyMissing}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-ink-500">Mã tương quan</dt>
          <dd className="m-0 mt-0.5 flex flex-wrap items-center gap-2 font-mono text-ink-800">
            <span>{item.correlationId ?? legacyMissing}</span>
            {item.correlationId && (
              <button
                type="button"
                onClick={() => onFilterCorrelation(item.correlationId!)}
                className="font-sans text-[11px] font-semibold text-brand-700 hover:underline cursor-pointer"
              >
                Lọc theo mã này
              </button>
            )}
          </dd>
        </div>
      </dl>
      <p className="rounded-md border border-border-subtle bg-white px-3 py-2 text-xs font-medium text-ink-900 m-0">
        {beforeLabel} → {name(after)}
        {afterStatus ? ` · ${afterStatus}` : ""}
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
    </div>
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
