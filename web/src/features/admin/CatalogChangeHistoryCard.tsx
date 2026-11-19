import { Card } from "../../shared/ui";
import {
  HistoryEntry,
  actionLabel,
  historyState,
  historyTime,
  legacyMissing,
  skillCategoryLabel,
  skillTypeLabel
} from "./adminTypes";

/** Renders auditable history records for a selected category or skill entry. */
export function CatalogChangeHistoryCard({
  history,
  isSkillTab
}: {
  history: HistoryEntry[];
  isSkillTab: boolean;
}) {
  return (
    <Card as="section" padding="md" className="space-y-3" aria-label="Lịch sử thay đổi">
      <h3 className="text-base font-bold text-ink-900 m-0">Lịch sử thay đổi</h3>
      {history.length ? (
        <ul className="space-y-3 pl-0 list-none m-0">
          {history.map((item, i) => {
            const before = historyState(item.before ?? item.beforeState);
            const after = historyState(item.after ?? item.afterState);
            return (
              <li
                key={item.id ?? i}
                className="rounded-lg border border-border-subtle bg-slate-50/70 p-3.5 space-y-2 break-words text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-brand-700">{actionLabel[item.action] ?? item.action}</strong>
                  <span className="text-ink-500">· {historyTime(item.createdAt ?? item.occurredAt)}</span>
                </div>
                <dl className="grid gap-1.5 sm:grid-cols-2 m-0">
                  <div>
                    <dt className="font-semibold text-ink-500">Người thực hiện</dt>
                    <dd className="m-0 font-mono text-ink-900">
                      {item.actorId ?? item.actorUserId ?? legacyMissing}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-500">Phiên bản</dt>
                    <dd className="m-0 text-ink-900">
                      {item.version ?? (typeof after?.version === "number" ? after.version : legacyMissing)}
                    </dd>
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
                <p className="rounded-lg border border-border-subtle bg-white px-3 py-1.5 font-medium text-ink-900 m-0">
                  {String(before?.name ?? before?.canonicalName ?? "Danh mục mới")} →{" "}
                  {String(after?.name ?? after?.canonicalName ?? "")}
                  {after?.status ? ` · ${String(after.status)}` : ""}
                </p>
                {Array.isArray(after?.aliases) && (
                  <small className="block text-ink-600">
                    Tên gọi khác:{" "}
                    {after.aliases
                      .map((alias: unknown) =>
                        typeof alias === "object" && alias !== null && "value" in alias ? String(alias.value) : ""
                      )
                      .filter(Boolean)
                      .join(", ") || "Không có"}
                  </small>
                )}
                {typeof after?.type === "string" && (
                  <p className="text-ink-700 m-0">
                    Loại kỹ năng: {skillTypeLabel[after.type] ?? after.type}
                    {typeof after.category === "string"
                      ? ` · Nhóm: ${skillCategoryLabel[after.category] ?? after.category}`
                      : ""}
                  </p>
                )}
                {isSkillTab && item.redacted && (
                  <p className="text-amber-800 font-medium m-0">Thông tin liên hệ đã được che trong bản ghi này.</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-500 m-0">Chưa có thay đổi.</p>
      )}
    </Card>
  );
}
