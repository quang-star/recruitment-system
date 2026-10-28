import { useUrlView } from "../../shared/navigation";
import { Dispatch, FormEvent, SetStateAction, useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { WorkspaceShell } from "../../shared/layout/WorkspaceShell";
import { CategoryEntry } from "../recruiter/JobCategoryFields";
import { PendingSkillQueue, PendingSkillSources } from "./PendingSkillQueue";
import { AdminAuditPanel } from "./AdminAuditPanel";
import { SkillCandidateSuggestions } from "./SkillCandidateSuggestions";

const skillTypes = ["language", "framework", "library", "database", "cloud", "devops", "testing", "data_ai", "security", "methodology", "soft_skill", "other"] as const;
const skillCategories = ["backend", "frontend", "fullstack", "mobile", "devops", "data_ai", "qa", "security", "cross_functional"] as const;
const relationTypes = ["BROADER", "NARROWER", "RELATED", "SUPERSEDES"] as const;
type SkillRelation = { type: typeof relationTypes[number]; targetSkillId: string };
type Skill = { stableId: string; canonicalName: string; status: string; aliases: Array<{ value: string }>;
  type: typeof skillTypes[number]; category: typeof skillCategories[number]; relations: SkillRelation[]; redacted?: boolean };
type SkillCatalog = { version: number; taxonomyVersion: string; skills: Skill[] };
type Action = "CREATE" | "EDIT" | "APPROVE" | "REJECT" | "MERGE" | "DEFER" | "REOPEN";
export function AdminWorkspace({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const [tab, setTab] = useUrlView<"categories" | "skills" | "audit">("admin", ["categories", "skills", "audit"], "categories");
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<CategoryEntry["kind"]>("INDUSTRY");
  const [parent, setParent] = useState("");
  const [skillType, setSkillType] = useState<Skill["type"]>("other");
  const [skillCategory, setSkillCategory] = useState<Skill["category"]>("cross_functional");
  const [relations, setRelations] = useState<SkillRelation[]>([]);
  const [reason, setReason] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadedTab, setLoadedTab] = useState<"categories" | "skills" | "audit" | null>(null);
  useEffect(() => {
    let active = true;
    setError(null);
    setLoadedTab(null);
    if (tab === "audit") { setLoadedTab(tab); return; }
    const load = tab === "categories" ? apiRequest<CategoryEntry[]>("/api/v2/dashboard/catalog", { accessToken: session.accessToken })
      .then((result) => { if (active) { setCategories(result); setLoadedTab(tab); setNeedsReload(false); } })
      : apiRequest<SkillCatalog>("/api/v2/taxonomy/skills", { accessToken: session.accessToken })
        .then((result) => { if (active) { setCatalog(result); setLoadedTab(tab); setNeedsReload(false); } });
    void load.catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [tab, attempt, session.userId]);
  const entries = tab === "categories" ? categories.map((entry) => ({ id: entry.id, name: entry.name, status: entry.status }))
    : (catalog?.skills ?? []).map((entry) => ({ id: entry.stableId, name: entry.canonicalName, status: entry.status }));
  const current = entries.find((entry) => entry.id === selected);
  const currentCategory = categories.find((entry) => entry.id === selected);
  const active = current && ["ACTIVE", "PENDING"].includes(current.status);
  const targets = entries.filter((entry) => entry.id !== selected && entry.status === "ACTIVE" &&
    (tab === "skills" || categories.some((c) => c.id === entry.id && c.kind === currentCategory?.kind && c.parentId === currentCategory?.parentId)));
  function select(id: string, latestCatalog = catalog) {
    setSelected(id); setHistory(null); setTarget(""); setReason(""); setNotice(null); setError(null);
    setName(tab === "skills" ? latestCatalog?.skills.find((entry) => entry.stableId === id)?.canonicalName ?? ""
      : categories.find((entry) => entry.id === id)?.name ?? "");
    const category = categories.find((entry) => entry.id === id);
    setKind(category?.kind ?? "INDUSTRY"); setParent(category?.parentId ?? "");
    const skill = latestCatalog?.skills.find((entry) => entry.stableId === id);
    setAliases(skill?.aliases.map((a) => a.value).join("\n") ?? "");
    setSkillType(skill?.type ?? "other"); setSkillCategory(skill?.category ?? "cross_functional");
    setRelations(skill?.relations.map((relation) => ({ ...relation })) ?? []);
  }
  async function selectQueuedSkill(id: string) {
    if (busy || needsReload || id === selected) return;
    setBusy(true); setError(null);
    try {
      const latest = await apiRequest<SkillCatalog>("/api/v2/taxonomy/skills", { accessToken: session.accessToken });
      setCatalog(latest); select(id, latest);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Không mở được đề xuất kỹ năng"); }
    finally { setBusy(false); }
  }
  async function act(action: Action) {
    if (busy || loadedTab !== tab || needsReload) return;
    const cleanReason = reason.trim();
    if (!cleanReason) { setError("Nhập lý do thay đổi trước khi thực hiện."); return; }
    const edits = ["CREATE", "EDIT", "APPROVE"].includes(action);
    if (edits && !name.trim()) { setError("Tên danh mục không được để trống."); return; }
    if (edits && tab === "skills" && /█/.test(name + aliases)) {
      setError("Thay nội dung đã che bằng tên kỹ năng và tên gọi khác không chứa thông tin liên hệ."); return;
    }
    if (edits && tab === "skills" && relations.some((relation) =>
      !catalog?.skills.some((skill) => skill.stableId === relation.targetSkillId && skill.stableId !== selected && skill.status === "ACTIVE"))) {
      setError("Mỗi quan hệ cần một kỹ năng đích đang hoạt động."); return;
    }
    setBusy(true); setError(null);
    try {
      if (tab === "categories") {
        await apiRequest(action === "CREATE" ? "/api/v2/dashboard/catalog" : `/api/v2/dashboard/catalog/${selected}`, {
          method: action === "CREATE" ? "POST" : "PUT", accessToken: session.accessToken,
          body: JSON.stringify(action === "CREATE" ? { kind, parentId: parent || null, name: name.trim(), reason: cleanReason }
            : { version: currentCategory?.version, action, reason: cleanReason,
              ...(edits ? { name: name.trim() } : {}),
              mergeTargetId: action === "MERGE" ? target : null })
        });
      } else {
        await apiRequest("/api/v2/taxonomy/skills", { method: "POST", accessToken: session.accessToken,
          body: JSON.stringify({ version: catalog?.version, action, skillId: selected || null,
            reason: cleanReason,
            ...(edits ? { name: name.trim(), aliases: aliases.split("\n").map((a) => a.trim()).filter(Boolean),
              type: skillType, category: skillCategory, relations } : {}),
            mergeTargetId: action === "MERGE" ? target : null }) });
      }
      setLoadedTab(null); setAttempt((n) => n + 1); select("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được danh mục");
      if (e instanceof ApiClientError && e.status === 409) setNeedsReload(true);
    }
    finally { setBusy(false); }
  }
  async function loadHistory() {
    setBusy(true); setError(null);
    try {
      setHistory(await apiRequest<HistoryEntry[]>(tab === "categories" ? `/api/v2/dashboard/catalog/${selected}/history`
        : `/api/v2/taxonomy/skills/${selected}/history`, { accessToken: session.accessToken }));
    } catch (e) { setError(e instanceof Error ? e.message : "Không tải được lịch sử"); }
    finally { setBusy(false); }
  }
  return <WorkspaceShell variant="recruiter" activeItem={tab} brandLabel="Quản trị Hệ thống" eyebrow="Quản trị danh mục"
    title="Danh mục tuyển dụng" userLabel="Admin" onLogout={onLogout}
    onNavigate={(next) => { if (!busy) { setTab(next); select(""); setNeedsReload(false); } }}
    navItems={[{ id: "categories", label: "Ngành / nhóm / vị trí", icon: null }, { id: "skills", label: "Kỹ năng / tên gọi khác", icon: null },
      { id: "audit", label: "Nhật ký thay đổi", icon: null }]}>
    {tab === "audit" ? <AdminAuditPanel accessToken={session.accessToken} /> : <section className="panel">
      <h2>{tab === "categories" ? "Ngành, nhóm chuyên môn và vị trí" : "Kỹ năng và tên gọi khác"}</h2>
      <p className="muted">Thay đổi áp dụng cho dữ liệu xử lý mới. Các JD, CV và điểm đã lưu giữ nguyên phiên bản.</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      {(error || needsReload) && <button disabled={busy} onClick={() => {
        setNotice(needsReload ? "Bản nháp được giữ lại. Kiểm tra phiên bản và trạng thái mới trước khi lưu lại." : null);
        setAttempt((n) => n + 1);
      }}>Tải lại</button>}
      {needsReload && <p role="status">Danh mục đã thay đổi. Tải lại trước khi lưu; bản nháp của bạn vẫn được giữ.</p>}
      {notice && <p role="status">{notice}</p>}
      {loadedTab !== tab && !error && <p role="status">Đang tải danh mục…</p>}
      {catalog && tab === "skills" && <p>Phiên bản taxonomy: {catalog.taxonomyVersion}</p>}
      <div className="admin-workbench"><aside className="admin-queue-pane">
        {tab === "categories" && <div className="application-table-wrap"><table className="application-table"><caption>Danh mục nghề</caption>
          <thead><tr><th>Tên danh mục</th><th>Trạng thái</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className={entry.id === selected ? "selected" : ""}>
            <td><button type="button" disabled={busy || loadedTab !== tab} onClick={() => select(entry.id)}>{entry.name}</button></td><td>{entry.status}</td>
          </tr>)}</tbody></table></div>}
      {catalog && tab === "skills" && loadedTab === tab && <PendingSkillQueue accessToken={session.accessToken}
        catalogVersion={catalog.version} disabled={busy || needsReload} selected={selected} onSelect={selectQueuedSkill}
        types={skillTypes.map((value) => ({ value, label: skillTypeLabel[value] }))}
        categories={skillCategories.map((value) => ({ value, label: skillCategoryLabel[value] }))} />}
      </aside><div className="admin-editor-pane">
      <label>Danh mục<select aria-label="Danh mục" disabled={busy || loadedTab !== tab} value={selected} onChange={(e) => select(e.target.value)}>
        <option value="">Thêm danh mục</option>
        {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.status}</option>)}
      </select></label>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void act(selected ? "EDIT" : "CREATE"); }}>
        <fieldset disabled={busy || loadedTab !== tab} style={{ minWidth: 0, display: "grid", gap: 16 }}>
          {tab === "skills" && catalog?.skills.find((skill) => skill.stableId === selected)?.redacted &&
            <p role="status">Tên hoặc tên gọi khác có thông tin liên hệ đã được che. Thay bằng tên kỹ năng hợp lệ trước khi sửa hoặc duyệt.</p>}
          {!selected && tab === "categories" && <>
            <label>Cấp<select aria-label="Cấp" value={kind} onChange={(e) => { setKind(e.target.value as CategoryEntry["kind"]); setParent(""); }}>
              <option value="INDUSTRY">Ngành</option><option value="SPECIALIZATION">Nhóm chuyên môn</option><option value="POSITION">Vị trí</option>
            </select></label>
            {kind !== "INDUSTRY" && <label>Danh mục cha<select aria-label="Danh mục cha" required value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Chọn danh mục cha</option>{categories.filter((c) => c.status === "ACTIVE" && c.kind ===
                (kind === "POSITION" ? "SPECIALIZATION" : "INDUSTRY")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>}
          </>}
          {selected && tab === "categories" && <p className="muted">Cấp: {categoryLabel[kind]}
            {parent ? ` · Danh mục cha: ${categories.find((category) => category.id === parent)?.name ?? parent}` : ""}.
            Cấp và danh mục cha được giữ nguyên sau khi tạo.</p>}
          <label>Tên<input required disabled={!!selected && !active} maxLength={tab === "skills" ? 240 : 160} value={name} onChange={(e) => setName(e.target.value)} /></label>
          {tab === "skills" && <SkillDefinitionFields disabled={!!selected && !active} selected={selected}
            aliases={aliases} onAliasesChange={setAliases} type={skillType} onTypeChange={setSkillType}
            category={skillCategory} onCategoryChange={setSkillCategory} relations={relations}
            onRelationsChange={setRelations} skills={catalog?.skills ?? []} />}
          <label>Lý do thay đổi<textarea required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <p className="muted">Lý do được lưu cùng người thực hiện và phiên bản. Duyệt sẽ lưu các giá trị đang chỉnh sửa.</p>
          <button disabled={needsReload || (!!selected && !active)} type="submit">{selected ? "Lưu sửa đổi" : "Thêm danh mục"}</button>
          {current?.status === "PENDING" && <div className="button-row">
            <button disabled={needsReload} type="button" onClick={() => void act("APPROVE")}>Duyệt</button>
            <button disabled={needsReload} type="button" className="secondary-button" onClick={() => void act("DEFER")}>Tạm hoãn</button>
            <button disabled={needsReload} type="button" className="danger-button" onClick={() => void act("REJECT")}>Từ chối</button>
          </div>}
          {current?.status === "DEFERRED" && <button disabled={needsReload} type="button" onClick={() => void act("REOPEN")}>Mở lại đề xuất</button>}
          {active && <div><label>Gộp vào danh mục đã có<select aria-label="Gộp vào danh mục đã có" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Chọn đích gộp</option>{targets.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label><button type="button" disabled={!target || needsReload} onClick={() => void act("MERGE")}>Gộp danh mục</button></div>}
          {selected && <button type="button" onClick={() => void loadHistory()}>Xem lịch sử thay đổi</button>}
        </fieldset>
      </form>
      {selected && catalog && tab === "skills" && <PendingSkillSources key={`sources:${selected}`} accessToken={session.accessToken}
        selected={selected} catalogVersion={catalog.version} skills={catalog.skills} />}
      {selected && catalog && tab === "skills" && <SkillCandidateSuggestions key={`candidates:${selected}`} accessToken={session.accessToken}
        selected={selected} catalogVersion={catalog.version} />}
      {history && <section aria-label="Lịch sử thay đổi"><h3>Lịch sử thay đổi</h3>
        {history.length ? <ul>{history.map((item, i) => {
          const before = historyState(item.before ?? item.beforeState);
          const after = historyState(item.after ?? item.afterState);
          return <li key={item.id ?? i} style={{ overflowWrap: "anywhere" }}><strong>{actionLabel[item.action] ?? item.action}</strong>
            <span> · {historyTime(item.createdAt ?? item.occurredAt)}</span>
            <dl>
              <dt>Người thực hiện</dt><dd>{item.actorId ?? item.actorUserId ?? legacyMissing}</dd>
              <dt>Phiên bản</dt><dd>{item.version ?? (typeof after?.version === "number" ? after.version : legacyMissing)}</dd>
              <dt>Lý do</dt><dd>{item.reason ?? legacyMissing}</dd>
              <dt>Mã tương quan</dt><dd>{item.correlationId ?? legacyMissing}</dd>
            </dl>
            <p>{String(before?.name ?? before?.canonicalName ?? "Danh mục mới")} → {String(after?.name ?? after?.canonicalName ?? "")}
              {after?.status ? ` · ${String(after.status)}` : ""}</p>
            {Array.isArray(after?.aliases) && <small>Tên gọi khác: {after.aliases.map((alias: unknown) =>
              typeof alias === "object" && alias !== null && "value" in alias ? String(alias.value) : "").filter(Boolean).join(", ") || "Không có"}</small>}
            {typeof after?.type === "string" && <p>Loại kỹ năng: {skillTypeLabel[after.type] ?? after.type}
              {typeof after.category === "string" ? ` · Nhóm: ${skillCategoryLabel[after.category] ?? after.category}` : ""}</p>}
            {tab === "skills" && item.redacted && <p className="muted">Thông tin liên hệ đã được che trong bản ghi này.</p>}
          </li>;
        })}</ul> : <p>Chưa có thay đổi.</p>}
      </section>}
      </div></div>
    </section>}
  </WorkspaceShell>;
}

function SkillDefinitionFields({ disabled, selected, aliases, onAliasesChange, type, onTypeChange,
  category, onCategoryChange, relations, onRelationsChange, skills }: {
  disabled: boolean; selected: string; aliases: string; onAliasesChange: (value: string) => void;
  type: Skill["type"]; onTypeChange: (value: Skill["type"]) => void;
  category: Skill["category"]; onCategoryChange: (value: Skill["category"]) => void;
  relations: SkillRelation[]; onRelationsChange: Dispatch<SetStateAction<SkillRelation[]>>; skills: Skill[];
}) {
  const targets = skills.filter((skill) => skill.stableId !== selected && skill.status === "ACTIVE");
  return <>
    <label>Tên gọi khác (mỗi dòng một tên)<textarea disabled={disabled} value={aliases} onChange={(e) => onAliasesChange(e.target.value)} /></label>
    <label>Loại kỹ năng<select aria-label="Loại kỹ năng" disabled={disabled} value={type} onChange={(e) => onTypeChange(e.target.value as Skill["type"])}>
      {skillTypes.map((value) => <option key={value} value={value}>{skillTypeLabel[value]}</option>)}
    </select></label>
    <label>Nhóm kỹ năng<select aria-label="Nhóm kỹ năng" disabled={disabled} value={category} onChange={(e) => onCategoryChange(e.target.value as Skill["category"])}>
      {skillCategories.map((value) => <option key={value} value={value}>{skillCategoryLabel[value]}</option>)}
    </select></label>
    <section aria-label="Quan hệ kỹ năng"><h3>Quan hệ kỹ năng</h3>
      {relations.map((relation, index) => <div key={index} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <label>Loại quan hệ {index + 1}<select aria-label={`Loại quan hệ ${index + 1}`} disabled={disabled} value={relation.type} onChange={(e) => onRelationsChange((rows) => rows.map((row, i) =>
          i === index ? { ...row, type: e.target.value as SkillRelation["type"] } : row))}>
          {relationTypes.map((value) => <option key={value} value={value}>{relationLabel[value]}</option>)}
        </select></label>
        <label>Kỹ năng đích {index + 1}<select aria-label={`Kỹ năng đích ${index + 1}`} disabled={disabled} value={relation.targetSkillId} onChange={(e) => onRelationsChange((rows) => rows.map((row, i) =>
          i === index ? { ...row, targetSkillId: e.target.value } : row))}>
          <option value="">Chọn kỹ năng đang hoạt động</option>
          {relation.targetSkillId && !targets.some((skill) => skill.stableId === relation.targetSkillId) &&
            <option value={relation.targetSkillId}>{skills.find((skill) => skill.stableId === relation.targetSkillId)?.canonicalName ?? relation.targetSkillId} (không còn hoạt động)</option>}
          {targets.map((skill) => <option key={skill.stableId} value={skill.stableId}>{skill.canonicalName}</option>)}
        </select></label>
        <button disabled={disabled} type="button" className="secondary-button" onClick={() => onRelationsChange((rows) => rows.filter((_, i) => i !== index))}>Xóa quan hệ {index + 1}</button>
      </div>)}
      <button disabled={disabled || relations.length >= 100} type="button" className="secondary-button"
        onClick={() => onRelationsChange((rows) => [...rows, { type: "RELATED", targetSkillId: "" }])}>Thêm quan hệ</button>
    </section>
  </>;
}

type HistoryEntry = { id?: string | number; action: string; actorId?: string | null; actorUserId?: string | null;
  version?: number | null; reason?: string | null; correlationId?: string | null;
  redacted?: boolean;
  before?: Record<string, unknown>; after?: Record<string, unknown>;
  beforeState?: string; afterState?: string; createdAt?: string; occurredAt?: string };
const legacyMissing = "Chưa được ghi (dữ liệu cũ)";
const categoryLabel: Record<CategoryEntry["kind"], string> = { INDUSTRY: "Ngành", SPECIALIZATION: "Nhóm chuyên môn", POSITION: "Vị trí" };
const actionLabel: Record<string, string> = { CREATE: "Thêm", PROPOSE: "Đề xuất", EDIT: "Sửa", APPROVE: "Duyệt", REJECT: "Từ chối", MERGE: "Gộp", DEFER: "Tạm hoãn", REOPEN: "Mở lại" };
const skillTypeLabel: Record<string, string> = { language: "Ngôn ngữ", framework: "Framework", library: "Thư viện", database: "Cơ sở dữ liệu", cloud: "Cloud", devops: "DevOps", testing: "Kiểm thử", data_ai: "Dữ liệu / AI", security: "Bảo mật", methodology: "Phương pháp", soft_skill: "Kỹ năng mềm", other: "Khác" };
const skillCategoryLabel: Record<string, string> = { backend: "Backend", frontend: "Frontend", fullstack: "Fullstack", mobile: "Mobile", devops: "DevOps", data_ai: "Dữ liệu / AI", qa: "QA", security: "Bảo mật", cross_functional: "Liên chức năng" };
const relationLabel: Record<SkillRelation["type"], string> = { BROADER: "Rộng hơn", NARROWER: "Hẹp hơn", RELATED: "Liên quan", SUPERSEDES: "Thay thế" };
function historyTime(value: string | undefined): string {
  const timestamp = value ? new Date(value) : null;
  return timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.toLocaleString("vi-VN") : legacyMissing;
}
function historyState(value: Record<string, unknown> | string | undefined): Record<string, unknown> | null {
  if (typeof value !== "string") return value ?? null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
