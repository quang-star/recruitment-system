import { FormEvent, ReactNode, useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { Badge, Button, Card, EmptyState, ErrorBanner, cn } from "../../shared/ui";

type Choice = { value: string; label: string };
type QueueItem = {
  skillId: string;
  name: string;
  status: string;
  type: string;
  category: string;
  occurrenceCount: number;
  sourceCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
};
type QueuePage = {
  catalogVersion: number;
  taxonomyVersion: string;
  page: number;
  size: number;
  totalElements: number;
  items: QueueItem[];
  catalogCapacity?: { limit: number; used: number; reached: boolean; unmappedTermsMayBeSkipped: boolean };
};
type Filters = { status: string; sourceKind: string; type: string; category: string; q: string; sort: string };

const initialFilters: Filters = {
  status: "PENDING",
  sourceKind: "",
  type: "",
  category: "",
  q: "",
  sort: "OCCURRENCES_DESC"
};

const statuses: Choice[] = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "DEFERRED", label: "Tạm hoãn" },
  { value: "REJECTED", label: "Đã từ chối" },
  { value: "ACTIVE", label: "Đang hoạt động" },
  { value: "MERGED", label: "Đã gộp" }
];

const fieldClass =
  "mt-1 h-9 w-full rounded-md border border-border-strong bg-white px-3 text-xs font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function PendingSkillQueue({
  accessToken,
  catalogVersion,
  disabled,
  selected,
  onSelect,
  types,
  categories,
  headerBadges,
  headerActions,
  statusContent
}: {
  accessToken: string;
  catalogVersion: number;
  disabled: boolean;
  selected: string;
  onSelect: (id: string) => Promise<void>;
  types: Choice[];
  categories: Choice[];
  headerBadges?: ReactNode;
  headerActions?: ReactNode;
  statusContent?: ReactNode;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<QueuePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    const query = new URLSearchParams({ page: String(page), size: "20" });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    void apiRequest<QueuePage>(`/api/v2/taxonomy/pending-skills?${query}`, { accessToken })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : "Không tải được hàng chờ kỹ năng");
      });
    return () => {
      active = false;
    };
  }, [filters, page, catalogVersion, attempt, accessToken]);

  function filter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  }

  return (
    <Card as="section" padding="md" className="space-y-4" aria-label="Hàng chờ kỹ năng">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-ink-900 m-0">Hàng chờ kỹ năng</h3>
          {headerBadges}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            Làm mới hàng chờ
          </Button>
          {headerActions}
        </div>
      </div>
      {statusContent}

      <form
        className="space-y-3 rounded-lg border border-border-subtle bg-slate-50/70 p-3.5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          filter("q", search.trim());
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[200px] text-xs font-semibold text-ink-700">
            Tìm thuật ngữ
            <input
              className={fieldClass}
              maxLength={120}
              value={search}
              placeholder="Tên kỹ năng hoặc thuật ngữ mới..."
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Button type="submit" variant="primary" size="sm">
            Tìm kỹ năng
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <label className="block text-xs font-semibold text-ink-700">
            Trạng thái đề xuất
            <select
              aria-label="Trạng thái đề xuất"
              className={fieldClass}
              value={filters.status}
              onChange={(event) => filter("status", event.target.value)}
            >
              {statuses.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            Nguồn đề xuất
            <select
              aria-label="Nguồn đề xuất"
              className={fieldClass}
              value={filters.sourceKind}
              onChange={(event) => filter("sourceKind", event.target.value)}
            >
              <option value="">Tất cả nguồn</option>
              <option value="CV">CV</option>
              <option value="JD">JD</option>
            </select>
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            Lọc loại kỹ năng
            <select
              aria-label="Lọc loại kỹ năng"
              className={fieldClass}
              value={filters.type}
              onChange={(event) => filter("type", event.target.value)}
            >
              <option value="">Tất cả loại</option>
              {types.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-ink-700">
            Lọc nhóm kỹ năng
            <select
              aria-label="Lọc nhóm kỹ năng"
              className={fieldClass}
              value={filters.category}
              onChange={(event) => filter("category", event.target.value)}
            >
              <option value="">Tất cả nhóm</option>
              {categories.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block col-span-2 md:col-span-1 text-xs font-semibold text-ink-700">
            Sắp xếp đề xuất
            <select
              aria-label="Sắp xếp đề xuất"
              className={fieldClass}
              value={filters.sort}
              onChange={(event) => filter("sort", event.target.value)}
            >
              <option value="OCCURRENCES_DESC">Nhiều lần ghi nhận nhất</option>
              <option value="LAST_SEEN_DESC">Ghi nhận gần nhất</option>
              <option value="FIRST_SEEN_ASC">Ghi nhận đầu tiên sớm nhất</option>
            </select>
          </label>
        </div>
        {(filters.status !== initialFilters.status ||
          filters.sourceKind ||
          filters.type ||
          filters.category ||
          filters.q ||
          filters.sort !== initialFilters.sort) && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilters(initialFilters);
                setPage(0);
              }}
              className="text-xs font-semibold text-brand-700 hover:underline cursor-pointer bg-transparent border-0 p-0"
            >
              Đặt lại bộ lọc
            </button>
          </div>
        )}
      </form>

      {error && (
        <ErrorBanner
          tone="error"
          message={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Tải lại hàng chờ
            </Button>
          }
        />
      )}

      {!result && !error && (
        <p role="status" className="text-sm text-ink-500 m-0">
          Đang tải hàng chờ…
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {result.catalogCapacity?.reached && (
            <p
              role="status"
              className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 m-0"
            >
              Danh mục đã đạt giới hạn {result.catalogCapacity.used}/{result.catalogCapacity.limit} kỹ năng.
              {result.catalogCapacity.unmappedTermsMayBeSkipped
                ? " Thuật ngữ mới chưa map có thể chưa xuất hiện trong hàng chờ."
                : ""}
              {" Số đếm phản ánh các nguồn đã ghi nhận."}
            </p>
          )}

          {result.items.length ? (
            <div className="overflow-x-auto rounded-lg border border-border-subtle bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Đề xuất kỹ năng</caption>
                <thead className="bg-slate-50 border-b border-border-subtle">
                  <tr className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <th className="px-4 py-2.5">Thuật ngữ</th>
                    <th className="px-3 py-2.5">Trạng thái</th>
                    <th className="px-4 py-2.5">Ghi nhận / nguồn</th>
                    <th className="px-4 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {result.items.map((item) => {
                    const isSelected = selected === item.skillId;
                    const statusLabel = statuses.find((status) => status.value === item.status)?.label ?? item.status;
                    const typeLabel = types.find((t) => t.value === item.type)?.label ?? item.type;
                    const catLabel = categories.find((c) => c.value === item.category)?.label ?? item.category;
                    return (
                      <tr
                        key={item.skillId}
                        className={cn(
                          "transition-colors hover:bg-slate-50/80",
                          isSelected && "bg-brand-50/60 border-l-4 border-l-brand-600"
                        )}
                      >
                        <td className="px-4 py-3 align-top">
                          <button
                            type="button"
                            disabled={disabled}
                            aria-pressed={isSelected}
                            onClick={() => void onSelect(item.skillId)}
                            className="text-left text-sm font-bold text-ink-900 hover:text-brand-700 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {item.name}
                          </button>
                          <small className="mt-0.5 block text-xs text-ink-600">
                            {typeLabel} · {catLabel}
                          </small>
                          <small className="mt-0.5 block text-xs text-ink-500">
                            Đầu tiên: {dateLabel(item.firstSeen)} · Gần nhất: {dateLabel(item.lastSeen)}
                          </small>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <Badge
                            tone={
                              item.status === "ACTIVE"
                                ? "success"
                                : item.status === "PENDING"
                                  ? "warning"
                                  : item.status === "REJECTED"
                                    ? "danger"
                                    : "neutral"
                            }
                          >
                            {statusLabel}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-ink-700 tabular-nums-kpi">
                          {item.occurrenceCount} lần ghi nhận · {item.sourceCount} phiên bản nguồn
                        </td>
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={disabled}
                            onClick={() => void onSelect(item.skillId)}
                          >
                            Chi tiết
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Không có kỹ năng phù hợp bộ lọc." />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle/80 pt-4">
            <p className="text-xs font-semibold text-ink-600 m-0 tabular-nums-kpi">
              {result.totalElements} kỹ năng · Trang {result.page + 1}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={result.page === 0} onClick={() => setPage((v) => v - 1)}>
                Trang đề xuất trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={result.page >= 100000 || (result.page + 1) * result.size >= result.totalElements}
                onClick={() => setPage((v) => v + 1)}
              >
                Trang đề xuất sau
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

type SkillDetail = { occurrenceCount: number; sourceCount: number; firstSeen: string | null; lastSeen: string | null };
type Occurrence = {
  occurrenceId: string;
  sourceKind: "CV" | "JD";
  sourceVersionId: string;
  firstRevisionId: string;
  latestRevisionId: string;
  fieldRole: string;
  rawTerm: string;
  provenance: string;
  normalizationStatus: string;
  confidence: number | null;
  evidenceRefs: Array<{ id: string; page?: number | null; start?: number; end?: number }>;
  context: {
    fieldRole: string;
    provenance: string;
    sourceConfirmed: boolean;
    criticality?: string;
    knownSkillIds: string[];
  };
  firstSeen: string;
  lastSeen: string;
};
type OccurrencePage = { page: number; size: number; totalElements: number; items: Occurrence[] };
const provenanceLabel: Record<string, string> = {
  EXTRACTED: "Trích xuất",
  USER_CONFIRMED: "Người dùng xác nhận",
  USER_ASSERTED: "Người dùng bổ sung"
};
const fieldLabel: Record<string, string> = {
  "CV.skills": "Kỹ năng CV",
  "JD.requiredSkills": "Kỹ năng bắt buộc JD",
  "JD.preferredSkills": "Kỹ năng ưu tiên JD"
};

export function PendingSkillSources({
  accessToken,
  selected,
  catalogVersion,
  skills
}: {
  accessToken: string;
  selected: string;
  catalogVersion: number;
  skills: Array<{ stableId: string; canonicalName: string }>;
}) {
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [result, setResult] = useState<OccurrencePage | null>(null);
  const [sourceKind, setSourceKind] = useState("");
  const [page, setPage] = useState(0);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [occurrenceError, setOccurrenceError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setDetailError(null);
    void apiRequest<SkillDetail>(`/api/v2/taxonomy/pending-skills/${selected}`, { accessToken })
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch((failure: unknown) => {
        if (active) setDetailError(failure instanceof Error ? failure.message : "Không tải được nguồn kỹ năng");
      });
    return () => {
      active = false;
    };
  }, [selected, catalogVersion, accessToken, attempt]);

  useEffect(() => {
    let active = true;
    setResult(null);
    setOccurrenceError(null);
    const query = new URLSearchParams({ page: String(page), size: "20" });
    if (sourceKind) query.set("sourceKind", sourceKind);
    void apiRequest<OccurrencePage>(`/api/v2/taxonomy/pending-skills/${selected}/occurrences?${query}`, { accessToken })
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((failure: unknown) => {
        if (active) setOccurrenceError(failure instanceof Error ? failure.message : "Không tải được lần ghi nhận");
      });
    return () => {
      active = false;
    };
  }, [selected, catalogVersion, sourceKind, page, accessToken, attempt]);

  return (
    <Card as="section" padding="md" className="mt-5 space-y-4" aria-label="Nguồn kỹ năng">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div>
          <h3 className="text-base font-bold text-ink-900 m-0">Nguồn kỹ năng</h3>
          <p className="text-xs text-ink-600 m-0 mt-0.5">
            Thông tin cấu trúc ghi nhận từ các phiên bản nguồn hiện còn đủ điều kiện sử dụng.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
          Làm mới nguồn kỹ năng
        </Button>
      </div>

      {(detailError || occurrenceError) && (
        <ErrorBanner
          tone="error"
          message={detailError ?? occurrenceError ?? "Không tải được nguồn kỹ năng"}
          action={
            <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>
              Tải lại nguồn kỹ năng
            </Button>
          }
        />
      )}

      {detail && (
        <p className="text-xs font-medium text-ink-700 m-0 rounded-lg bg-slate-50 px-3 py-2 border border-border-subtle">
          {detail.occurrenceCount} lần ghi nhận · {detail.sourceCount} phiên bản nguồn
          {` · Đầu tiên: ${dateLabel(detail.firstSeen)} · Gần nhất: ${dateLabel(detail.lastSeen)}`}
        </p>
      )}

      <div className="max-w-xs">
        <label className="block text-xs font-semibold text-ink-700">
          Lọc nguồn ghi nhận
          <select
            aria-label="Lọc nguồn ghi nhận"
            className={fieldClass}
            value={sourceKind}
            onChange={(event) => {
              setSourceKind(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Tất cả nguồn</option>
            <option value="CV">CV</option>
            <option value="JD">JD</option>
          </select>
        </label>
      </div>

      {(!detail || !result) && !detailError && !occurrenceError && (
        <p role="status" className="text-sm text-ink-500 m-0">
          Đang tải nguồn kỹ năng…
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {result.items.length ? (
            <ul className="space-y-3 pl-0 list-none m-0">
              {result.items.map((item) => (
                <li
                  key={item.occurrenceId}
                  className="rounded-lg border border-border-subtle bg-slate-50/70 p-4 space-y-2 break-words"
                >
                  <strong className="block text-sm font-bold text-ink-900">{item.rawTerm}</strong>
                  <p className="text-xs font-medium text-ink-600 m-0">
                    {item.sourceKind} · {fieldLabel[item.fieldRole] ?? item.fieldRole} ·{" "}
                    {provenanceLabel[item.provenance] ?? item.provenance}
                    {` · ${item.normalizationStatus === "KNOWN" ? "Đã chuẩn hóa" : "Chờ chuẩn hóa"}`}
                  </p>
                  <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 text-xs m-0">
                    <div>
                      <dt className="font-semibold text-ink-500">Phiên bản nguồn</dt>
                      <dd className="m-0 font-mono text-ink-800">{item.sourceVersionId}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-500">Revision đầu tiên</dt>
                      <dd className="m-0 font-mono text-ink-800">{item.firstRevisionId}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-500">Revision gần nhất</dt>
                      <dd className="m-0 font-mono text-ink-800">{item.latestRevisionId}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-500">Độ tin cậy ghi nhận</dt>
                      <dd className="m-0 text-ink-800">
                        {item.confidence === null ? "Chưa được ghi" : `${Math.round(item.confidence * 100)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-500">Xác nhận nguồn</dt>
                      <dd className="m-0 text-ink-800">
                        {item.context.sourceConfirmed ? "Đã xác nhận" : "Đang chờ xác nhận"}
                      </dd>
                    </div>
                    {item.context.criticality && (
                      <div>
                        <dt className="font-semibold text-ink-500">Mức yêu cầu</dt>
                        <dd className="m-0 text-ink-800">
                          {item.context.criticality === "CRITICAL" ? "Bắt buộc" : "Ưu tiên"}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="font-semibold text-ink-500">Kỹ năng đã chuẩn hóa cùng nhóm</dt>
                      <dd className="m-0 text-ink-800">
                        {item.context.knownSkillIds
                          .map((id) => skills.find((skill) => skill.stableId === id)?.canonicalName ?? id)
                          .join(", ") || "Không được ghi nhận"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-ink-500">Đầu tiên / gần nhất</dt>
                      <dd className="m-0 text-ink-800">
                        {dateLabel(item.firstSeen)} / {dateLabel(item.lastSeen)}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-ink-600 m-0 pt-1 border-t border-border-subtle">
                    Tham chiếu evidence:{" "}
                    {item.evidenceRefs.length
                      ? item.evidenceRefs
                          .map((reference) =>
                            [
                              reference.id,
                              reference.page != null ? `trang ${reference.page}` : null,
                              reference.start != null && reference.end != null
                                ? `vị trí ${reference.start}–${reference.end}`
                                : null
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          )
                          .join("; ")
                      : "Chưa được ghi"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-500 m-0">Chưa có nguồn được ghi nhận trong bộ lọc này.</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <p className="text-xs font-semibold text-ink-600 m-0 tabular-nums-kpi">
              {result.totalElements} lần ghi nhận · Trang {result.page + 1}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={result.page === 0} onClick={() => setPage((v) => v - 1)}>
                Trang nguồn trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={result.page >= 100000 || (result.page + 1) * result.size >= result.totalElements}
                onClick={() => setPage((v) => v + 1)}
              >
                Trang nguồn sau
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function dateLabel(value: string | null): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("vi-VN") : "Chưa được ghi";
}
