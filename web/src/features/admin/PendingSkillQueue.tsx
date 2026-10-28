import { FormEvent, useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";

type Choice = { value: string; label: string };
type QueueItem = { skillId: string; name: string; status: string; type: string; category: string;
  occurrenceCount: number; sourceCount: number; firstSeen: string | null; lastSeen: string | null };
type QueuePage = { catalogVersion: number; taxonomyVersion: string; page: number; size: number;
  totalElements: number; items: QueueItem[];
  catalogCapacity?: { limit: number; used: number; reached: boolean; unmappedTermsMayBeSkipped: boolean } };
type Filters = { status: string; sourceKind: string; type: string; category: string; q: string; sort: string };
const initialFilters: Filters = { status: "PENDING", sourceKind: "", type: "", category: "", q: "", sort: "OCCURRENCES_DESC" };
const statuses: Choice[] = [
  { value: "PENDING", label: "Chờ duyệt" }, { value: "DEFERRED", label: "Tạm hoãn" },
  { value: "REJECTED", label: "Đã từ chối" }, { value: "ACTIVE", label: "Đang hoạt động" }, { value: "MERGED", label: "Đã gộp" }
];

export function PendingSkillQueue({ accessToken, catalogVersion, disabled, selected, onSelect, types, categories }: {
  accessToken: string; catalogVersion: number; disabled: boolean; selected: string;
  onSelect: (id: string) => Promise<void>; types: Choice[]; categories: Choice[];
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<QueuePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null); setError(null);
    const query = new URLSearchParams({ page: String(page), size: "20" });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    void apiRequest<QueuePage>(`/api/v2/taxonomy/pending-skills?${query}`, { accessToken }).then((value) => {
      if (active) setResult(value);
    }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : "Không tải được hàng chờ kỹ năng"); });
    return () => { active = false; };
  }, [filters, page, catalogVersion, attempt, accessToken]);
  function filter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value })); setPage(0);
  }
  return <section aria-label="Hàng chờ kỹ năng" style={{ marginTop: 20, marginBottom: 20 }}>
    <h3>Hàng chờ kỹ năng</h3>
    <button type="button" onClick={() => setAttempt((value) => value + 1)}>Làm mới hàng chờ</button>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); filter("q", search.trim()); }}>
      <label>Tìm thuật ngữ<input maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <button type="submit">Tìm kỹ năng</button>
      <label>Trạng thái đề xuất<select aria-label="Trạng thái đề xuất" value={filters.status} onChange={(event) => filter("status", event.target.value)}>
        {statuses.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select></label>
      <label>Nguồn đề xuất<select aria-label="Nguồn đề xuất" value={filters.sourceKind} onChange={(event) => filter("sourceKind", event.target.value)}>
        <option value="">Tất cả nguồn</option><option value="CV">CV</option><option value="JD">JD</option>
      </select></label>
      <label>Lọc loại kỹ năng<select aria-label="Lọc loại kỹ năng" value={filters.type} onChange={(event) => filter("type", event.target.value)}>
        <option value="">Tất cả loại</option>{types.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select></label>
      <label>Lọc nhóm kỹ năng<select aria-label="Lọc nhóm kỹ năng" value={filters.category} onChange={(event) => filter("category", event.target.value)}>
        <option value="">Tất cả nhóm</option>{categories.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select></label>
      <label>Sắp xếp đề xuất<select aria-label="Sắp xếp đề xuất" value={filters.sort} onChange={(event) => filter("sort", event.target.value)}>
        <option value="OCCURRENCES_DESC">Nhiều lần ghi nhận nhất</option><option value="LAST_SEEN_DESC">Ghi nhận gần nhất</option>
        <option value="FIRST_SEEN_ASC">Ghi nhận đầu tiên sớm nhất</option>
      </select></label>
    </form>
    {error && <p role="alert">{error} <button onClick={() => setAttempt((value) => value + 1)}>Tải lại hàng chờ</button></p>}
    {!result && !error && <p role="status">Đang tải hàng chờ…</p>}
    {result && <>
      {result.catalogCapacity?.reached && <p role="status">Danh mục đã đạt giới hạn {result.catalogCapacity.used}/{result.catalogCapacity.limit} kỹ năng.
        {result.catalogCapacity.unmappedTermsMayBeSkipped ? " Thuật ngữ mới chưa map có thể chưa xuất hiện trong hàng chờ." : ""}
        {" Số đếm phản ánh các nguồn đã ghi nhận."}</p>}
      <p>{result.totalElements} kỹ năng · Trang {result.page + 1}</p>
      {result.items.length ? <div className="application-table-wrap"><table className="application-table"><caption className="sr-only">Đề xuất kỹ năng</caption>
        <thead><tr><th>Thuật ngữ</th><th>Trạng thái</th><th>Ghi nhận / nguồn</th></tr></thead>
        <tbody>{result.items.map((item) => <tr key={item.skillId} className={selected === item.skillId ? "selected" : ""}>
          <td><button type="button" disabled={disabled} aria-pressed={selected === item.skillId} onClick={() => void onSelect(item.skillId)}>{item.name}</button>
            <small>Đầu tiên: {dateLabel(item.firstSeen)} · Gần nhất: {dateLabel(item.lastSeen)}</small></td>
          <td>{statuses.find((status) => status.value === item.status)?.label ?? item.status}</td>
          <td>{item.occurrenceCount} lần ghi nhận · {item.sourceCount} phiên bản nguồn</td>
        </tr>)}</tbody>
      </table></div> : <p>Không có kỹ năng phù hợp bộ lọc.</p>}
      <div className="page-controls">
        <button disabled={result.page === 0} onClick={() => setPage((value) => value - 1)}>Trang đề xuất trước</button>
        <button disabled={result.page >= 100000 || (result.page + 1) * result.size >= result.totalElements} onClick={() => setPage((value) => value + 1)}>Trang đề xuất sau</button>
      </div>
    </>}
  </section>;
}

type SkillDetail = { occurrenceCount: number; sourceCount: number; firstSeen: string | null; lastSeen: string | null };
type Occurrence = { occurrenceId: string; sourceKind: "CV" | "JD"; sourceVersionId: string;
  firstRevisionId: string; latestRevisionId: string; fieldRole: string; rawTerm: string;
  provenance: string; normalizationStatus: string; confidence: number | null;
  evidenceRefs: Array<{ id: string; page?: number | null; start?: number; end?: number }>;
  context: { fieldRole: string; provenance: string; sourceConfirmed: boolean; criticality?: string; knownSkillIds: string[] };
  firstSeen: string; lastSeen: string };
type OccurrencePage = { page: number; size: number; totalElements: number; items: Occurrence[] };
const provenanceLabel: Record<string, string> = { EXTRACTED: "Trích xuất", USER_CONFIRMED: "Người dùng xác nhận", USER_ASSERTED: "Người dùng bổ sung" };
const fieldLabel: Record<string, string> = { "CV.skills": "Kỹ năng CV", "JD.requiredSkills": "Kỹ năng bắt buộc JD", "JD.preferredSkills": "Kỹ năng ưu tiên JD" };

export function PendingSkillSources({ accessToken, selected, catalogVersion, skills }: {
  accessToken: string; selected: string; catalogVersion: number; skills: Array<{ stableId: string; canonicalName: string }>;
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
    setDetail(null); setDetailError(null);
    void apiRequest<SkillDetail>(`/api/v2/taxonomy/pending-skills/${selected}`, { accessToken }).then((value) => {
      if (active) setDetail(value);
    }).catch((failure: unknown) => { if (active) setDetailError(failure instanceof Error ? failure.message : "Không tải được nguồn kỹ năng"); });
    return () => { active = false; };
  }, [selected, catalogVersion, accessToken, attempt]);
  useEffect(() => {
    let active = true;
    setResult(null); setOccurrenceError(null);
    const query = new URLSearchParams({ page: String(page), size: "20" });
    if (sourceKind) query.set("sourceKind", sourceKind);
    void apiRequest<OccurrencePage>(`/api/v2/taxonomy/pending-skills/${selected}/occurrences?${query}`, { accessToken }).then((value) => {
      if (active) setResult(value);
    }).catch((failure: unknown) => { if (active) setOccurrenceError(failure instanceof Error ? failure.message : "Không tải được lần ghi nhận"); });
    return () => { active = false; };
  }, [selected, catalogVersion, sourceKind, page, accessToken, attempt]);
  return <section aria-label="Nguồn kỹ năng" style={{ marginTop: 20 }}>
    <h3>Nguồn kỹ năng</h3>
    <button type="button" onClick={() => setAttempt((value) => value + 1)}>Làm mới nguồn kỹ năng</button>
    <p className="muted">Thông tin cấu trúc ghi nhận từ các phiên bản nguồn hiện còn đủ điều kiện sử dụng.</p>
    {(detailError || occurrenceError) && <p role="alert">{detailError ?? occurrenceError} <button onClick={() => setAttempt((value) => value + 1)}>Tải lại nguồn kỹ năng</button></p>}
    {detail && <p>{detail.occurrenceCount} lần ghi nhận · {detail.sourceCount} phiên bản nguồn
      {` · Đầu tiên: ${dateLabel(detail.firstSeen)} · Gần nhất: ${dateLabel(detail.lastSeen)}`}</p>}
    <label>Lọc nguồn ghi nhận<select aria-label="Lọc nguồn ghi nhận" value={sourceKind} onChange={(event) => { setSourceKind(event.target.value); setPage(0); }}>
      <option value="">Tất cả nguồn</option><option value="CV">CV</option><option value="JD">JD</option>
    </select></label>
    {(!detail || !result) && !detailError && !occurrenceError && <p role="status">Đang tải nguồn kỹ năng…</p>}
    {result && <>
      {result.items.length ? <ul>{result.items.map((item) => <li key={item.occurrenceId} style={{ overflowWrap: "anywhere", marginBottom: 16 }}>
        <strong>{item.rawTerm}</strong>
        <p>{item.sourceKind} · {fieldLabel[item.fieldRole] ?? item.fieldRole} · {provenanceLabel[item.provenance] ?? item.provenance}
          {` · ${item.normalizationStatus === "KNOWN" ? "Đã chuẩn hóa" : "Chờ chuẩn hóa"}`}</p>
        <dl>
          <dt>Phiên bản nguồn</dt><dd>{item.sourceVersionId}</dd>
          <dt>Revision đầu tiên</dt><dd>{item.firstRevisionId}</dd>
          <dt>Revision gần nhất</dt><dd>{item.latestRevisionId}</dd>
          <dt>Độ tin cậy ghi nhận</dt><dd>{item.confidence === null ? "Chưa được ghi" : `${Math.round(item.confidence * 100)}%`}</dd>
          <dt>Xác nhận nguồn</dt><dd>{item.context.sourceConfirmed ? "Đã xác nhận" : "Đang chờ xác nhận"}</dd>
          {item.context.criticality && <><dt>Mức yêu cầu</dt><dd>{item.context.criticality === "CRITICAL" ? "Bắt buộc" : "Ưu tiên"}</dd></>}
          <dt>Kỹ năng đã chuẩn hóa cùng nhóm</dt><dd>{item.context.knownSkillIds.map((id) => skills.find((skill) => skill.stableId === id)?.canonicalName ?? id).join(", ") || "Không được ghi nhận"}</dd>
          <dt>Đầu tiên / gần nhất</dt><dd>{dateLabel(item.firstSeen)} / {dateLabel(item.lastSeen)}</dd>
        </dl>
        <p>Tham chiếu evidence: {item.evidenceRefs.length ? item.evidenceRefs.map((reference) => [reference.id,
          reference.page != null ? `trang ${reference.page}` : null,
          reference.start != null && reference.end != null ? `vị trí ${reference.start}–${reference.end}` : null].filter(Boolean).join(" · ")).join("; ") : "Chưa được ghi"}</p>
      </li>)}</ul> : <p>Chưa có nguồn được ghi nhận trong bộ lọc này.</p>}
      <p>{result.totalElements} lần ghi nhận · Trang {result.page + 1}</p>
      <div className="page-controls">
        <button disabled={result.page === 0} onClick={() => setPage((value) => value - 1)}>Trang nguồn trước</button>
        <button disabled={result.page >= 100000 || (result.page + 1) * result.size >= result.totalElements} onClick={() => setPage((value) => value + 1)}>Trang nguồn sau</button>
      </div>
    </>}
  </section>;
}

function dateLabel(value: string | null): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("vi-VN") : "Chưa được ghi";
}
