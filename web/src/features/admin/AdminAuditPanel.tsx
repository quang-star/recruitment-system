import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";

type Service = "CORE" | "AI";
type Filters = { actor: string; resourceId: string; action: string; correlationId: string; from: string; to: string };
const emptyFilters: Filters = { actor: "", resourceId: "", action: "", correlationId: "", from: "", to: "" };
const uuidPattern = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const businessIdPattern = "[1-9][0-9]{0,18}";
const actions: Record<string, string> = { CREATE: "Thêm", PROPOSE: "Đề xuất", EDIT: "Sửa", APPROVE: "Duyệt", MERGE: "Gộp", REJECT: "Từ chối", DEFER: "Tạm hoãn", REOPEN: "Mở lại" };
const legacyMissing = "Chưa được ghi (dữ liệu cũ)";
type AuditEntry = { id: string | number; resourceId: string; action: string; actorId?: string; actorUserId?: string;
  version: number | null; reason: string | null; correlationId: string | null;
  before?: Record<string, unknown> | null; after?: Record<string, unknown>;
  beforeState?: string | null; afterState?: string; createdAt?: string; occurredAt?: string; redacted?: boolean };
type AuditPage = { items: AuditEntry[]; total: number; page: number; size: number };

export function AdminAuditPanel({ accessToken }: { accessToken: string }) {
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [service, setService] = useState<Service>("CORE");
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null); setError(null);
    const query = new URLSearchParams({ page: String(page), size: "20" });
    for (const [key, value] of Object.entries(filters)) if (value) {
      const parameter = key === "actor" ? (service === "CORE" ? "actorUserId" : "actorId") : key;
      query.set(parameter, key === "from" || key === "to" ? new Date(value).toISOString() : value);
    }
    const endpoint = service === "CORE" ? "/api/v2/dashboard/catalog/history" : "/api/v2/taxonomy/skills/history";
    void apiRequest<AuditPage>(`${endpoint}?${query}`, { accessToken }).then((value) => {
      if (active) setResult(value);
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Không tải được nhật ký"); });
    return () => { active = false; };
  }, [service, filters, page, attempt, accessToken]);
  function filter(event: FormEvent) {
    event.preventDefault();
    if ([draft.from, draft.to].some((value) => value && !Number.isFinite(new Date(value).getTime()))) {
      setError("Thời điểm tìm kiếm không hợp lệ."); return;
    }
    if (draft.from && draft.to && new Date(draft.from) > new Date(draft.to)) {
      setError("Thời điểm bắt đầu phải trước hoặc bằng thời điểm kết thúc."); return;
    }
    setFilters({ ...draft, actor: draft.actor.trim(), resourceId: draft.resourceId.trim(), correlationId: draft.correlationId.trim() });
    setPage(0);
  }
  function field(key: keyof Filters, value: string) { setDraft((current) => ({ ...current, [key]: value })); }
  return <section className="panel" aria-label="Tra cứu nhật ký">
    <h2>Nhật ký thay đổi</h2>
    <p className="muted">Chọn danh mục nghề hoặc kỹ năng để tìm lịch sử tương ứng.</p>
    <label>Nguồn nhật ký<select aria-label="Nguồn nhật ký" value={service} onChange={(event) => {
      setService(event.target.value as Service); setDraft(emptyFilters); setFilters(emptyFilters); setPage(0);
    }}><option value="CORE">Danh mục nghề (Core)</option><option value="AI">Kỹ năng (AI)</option></select></label>
    <form className="audit-filters" onSubmit={filter} aria-label="Bộ lọc nhật ký">
      <label>ID người thực hiện<input maxLength={19} inputMode="numeric" pattern={businessIdPattern} value={draft.actor} onChange={(event) => field("actor", event.target.value)} /></label>
      <label>ID danh mục / kỹ năng<input maxLength={19} inputMode="numeric" pattern={businessIdPattern} value={draft.resourceId} onChange={(event) => field("resourceId", event.target.value)} /></label>
      <label>Hành động nhật ký<select aria-label="Hành động nhật ký" value={draft.action} onChange={(event) => field("action", event.target.value)}>
        <option value="">Tất cả hành động</option>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Mã tương quan nhật ký<input maxLength={36} pattern={uuidPattern} value={draft.correlationId} onChange={(event) => field("correlationId", event.target.value)} /></label>
      <label>Thời gian từ (giờ địa phương)<input type="datetime-local" value={draft.from} onChange={(event) => field("from", event.target.value)} /></label>
      <label>Thời gian đến (giờ địa phương)<input type="datetime-local" value={draft.to} onChange={(event) => field("to", event.target.value)} /></label>
      <div className="button-row"><button type="submit">Tìm nhật ký</button>
        <button type="button" className="secondary-button" onClick={() => { setDraft(emptyFilters); setFilters(emptyFilters); setPage(0); }}>Xóa bộ lọc nhật ký</button></div>
    </form>
    <button type="button" onClick={() => setAttempt((value) => value + 1)}>Làm mới nhật ký</button>
    {error && <p role="alert">{error}</p>}
    {!result && !error && <p role="status">Đang tải nhật ký…</p>}
    {result && <>
      <p>{result.total} thay đổi · Trang {result.page + 1} · {service === "CORE" ? "Danh mục nghề (Core)" : "Kỹ năng (AI)"}</p>
      {result.items.length ? <div className="application-master-detail">
        <div className="application-table-wrap"><table className="application-table"><caption className="sr-only">Các thay đổi được ghi nhận</caption>
          <thead><tr><th>Hành động</th><th>Danh mục / kỹ năng</th><th>Thời điểm</th></tr></thead>
          <tbody>{result.items.map((item) => <tr key={item.id} className={(selectedId ?? result.items[0]?.id) === item.id ? "selected" : ""}>
            <td><button type="button" onClick={() => setSelectedId(item.id)}>{actions[item.action] ?? item.action}</button></td>
            <td>{name(state(item.after ?? item.afterState))}</td><td>{item.createdAt ?? item.occurredAt ?? legacyMissing}</td>
          </tr>)}</tbody></table></div>
        <ol className="audit-record-detail">{result.items.filter((item) => item.id === (result.items.find((row) => row.id === selectedId)?.id ?? result.items[0]?.id)).map((item) => <AuditRecord key={item.id} item={item} service={service} />)}</ol>
      </div>
        : <p>Không có thay đổi phù hợp bộ lọc.</p>}
      <div className="page-controls"><button disabled={result.page === 0} onClick={() => setPage((value) => value - 1)}>Trang nhật ký trước</button>
        <button disabled={result.page >= 100000 || (result.page + 1) * result.size >= result.total} onClick={() => setPage((value) => value + 1)}>Trang nhật ký sau</button></div>
    </>}
  </section>;
}

function AuditRecord({ item, service }: { item: AuditEntry; service: Service }) {
  const before = state(item.before ?? item.beforeState);
  const after = state(item.after ?? item.afterState);
  const occurred = item.createdAt ?? item.occurredAt;
  const date = occurred ? new Date(occurred) : null;
  return <li style={{ overflowWrap: "anywhere", marginBottom: 16 }}>
    <strong>{actions[item.action] ?? item.action}</strong>
    <p>{date && !Number.isNaN(date.getTime()) ? date.toLocaleString("vi-VN") : legacyMissing}</p>
    <dl><dt>ID danh mục / kỹ năng</dt><dd>{item.resourceId}</dd>
      <dt>Người thực hiện</dt><dd>{(service === "CORE" ? item.actorUserId : item.actorId) ?? legacyMissing}</dd>
      <dt>Phiên bản</dt><dd>{item.version ?? legacyMissing}</dd>
      <dt>Lý do</dt><dd>{item.reason ?? legacyMissing}</dd>
      <dt>Mã tương quan</dt><dd>{item.correlationId ?? legacyMissing}</dd></dl>
    <p>{name(before)} → {name(after)}{typeof after?.status === "string" ? ` · ${after.status}` : ""}</p>
    {service === "AI" && item.redacted && <p className="muted">Thông tin liên hệ đã được che trong bản ghi này.</p>}
  </li>;
}

function name(value: Record<string, unknown> | null): string {
  const label = value?.name ?? value?.canonicalName;
  return typeof label === "string" ? label : legacyMissing;
}
function state(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> | null {
  if (typeof value !== "string") return value ?? null;
  try { const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
