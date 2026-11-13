import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { CompanyIcon, HistoryIcon, LayersIcon, SparklesIcon } from "../../shared/components/Icon";
import { WorkspaceNavItem, WorkspaceShell } from "../../shared/layout/WorkspaceShell";
import { EnsureRouter, useSafeNavigate } from "../../shared/router";
import { Badge, Button, Card, ErrorBanner, Tabs, cn } from "../../shared/ui";
import { CategoryEntry } from "../recruiter/JobCategoryFields";
import { AdminAuditPanel } from "./AdminAuditPanel";
import { CompanyReviewPanel } from "./CompanyReviewPanel";
import { AdminCatalogForm } from "./AdminCatalogForm";
import { CatalogChangeHistoryCard } from "./CatalogChangeHistoryCard";
import { PendingSkillQueue, PendingSkillSources } from "./PendingSkillQueue";
import { SkillCandidateSuggestions } from "./SkillCandidateSuggestions";
import {
  Action,
  AdminTab,
  HistoryEntry,
  Skill,
  SkillCatalog,
  SkillRelation,
  adminRouteMap,
  adminPageTitle,
  catalogStatusLabel,
  resolveAdminTab,
  skillCategories,
  skillCategoryLabel,
  relationLabel,
  skillTypeLabel,
  skillTypes
} from "./adminTypes";

const adminNavItems: WorkspaceNavItem<AdminTab>[] = [
  { id: "categories", label: "Ngành / nhóm / vị trí", icon: <LayersIcon size={18} /> },
  { id: "skills", label: "Kỹ năng / tên gọi khác", icon: <SparklesIcon size={18} /> },
  { id: "audit", label: "Nhật ký thay đổi", icon: <HistoryIcon size={18} /> },
  { id: "companies", label: "Duyệt công ty", icon: <CompanyIcon size={18} /> }
];

function AdminWorkspaceEditor({ session, onLogout, tab }: { session: AuthSession; onLogout: () => void; tab: AdminTab }) {
  const navigate = useSafeNavigate();

  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [skillPanel, setSkillPanel] = useState<"edit" | "sources" | "suggestions">("edit");
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
  const [reviewRequired, setReviewRequired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadedTab, setLoadedTab] = useState<AdminTab | null>(null);
  const queueRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && window.innerWidth < 1280) {
      editorRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>("input:not(:disabled), select:not(:disabled)")?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView?.({ block: "start" });
    }
  }, [selected]);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoadedTab(null);
    if (tab === "audit" || tab === "companies") {
      setLoadedTab(tab);
      return;
    }
    const load =
      tab === "categories"
        ? apiRequest<CategoryEntry[]>("/api/v2/dashboard/catalog", { accessToken: session.accessToken }).then(
            (result) => {
              if (active) {
                setCategories(result);
                setLoadedTab(tab);
                setNeedsReload(false);
              }
            }
          )
        : apiRequest<SkillCatalog>("/api/v2/taxonomy/skills", { accessToken: session.accessToken }).then((result) => {
            if (active) {
              setCatalog(result);
              setLoadedTab(tab);
              setNeedsReload(false);
            }
          });
    void load.catch((e: Error) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [tab, attempt, session.accessToken, session.userId]);

  const entries =
    tab === "categories"
      ? categories.map((entry) => ({ id: entry.id, name: entry.name, status: entry.status }))
      : (catalog?.skills ?? []).map((entry) => ({
          id: entry.stableId,
          name: entry.canonicalName,
          status: entry.status
        }));
  const current = entries.find((entry) => entry.id === selected);
  const currentCategory = categories.find((entry) => entry.id === selected);
  const currentSkill = catalog?.skills.find((entry) => entry.stableId === selected);
  const active = Boolean(current && ["ACTIVE", "PENDING"].includes(current.status));
  const targets = entries.filter(
    (entry) =>
      entry.id !== selected &&
      entry.status === "ACTIVE" &&
      (tab === "skills" ||
        categories.some((c) => c.id === entry.id && c.kind === currentCategory?.kind && c.parentId === currentCategory?.parentId))
  );

  function select(id: string, latestCatalog = catalog) {
    setReviewRequired(false);
    setSelected(id);
    setSkillPanel("edit");
    setHistory(null);
    setTarget("");
    setReason("");
    setNotice(null);
    setError(null);
    setName(
      tab === "skills"
        ? latestCatalog?.skills.find((entry) => entry.stableId === id)?.canonicalName ?? ""
        : categories.find((entry) => entry.id === id)?.name ?? ""
    );
    const category = categories.find((entry) => entry.id === id);
    setKind(category?.kind ?? "INDUSTRY");
    setParent(category?.parentId ?? "");
    const skill = latestCatalog?.skills.find((entry) => entry.stableId === id);
    setAliases(skill?.aliases.map((a) => a.value).join("\n") ?? "");
    setSkillType(skill?.type ?? "other");
    setSkillCategory(skill?.category ?? "cross_functional");
    setRelations(skill?.relations.map((relation) => ({ ...relation })) ?? []);
  }

  async function selectQueuedSkill(id: string) {
    if (busy || needsReload || reviewRequired || id === selected) return;
    setBusy(true);
    setError(null);
    try {
      const latest = await apiRequest<SkillCatalog>("/api/v2/taxonomy/skills", { accessToken: session.accessToken });
      setCatalog(latest);
      select(id, latest);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không mở được đề xuất kỹ năng");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: Action) {
    if (busy || loadedTab !== tab || needsReload || reviewRequired) return;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setError("Nhập lý do thay đổi trước khi thực hiện.");
      return;
    }
    const edits = ["CREATE", "EDIT", "APPROVE"].includes(action);
    if (edits && !name.trim()) {
      setError("Tên danh mục không được để trống.");
      return;
    }
    if (edits && tab === "skills" && /█/.test(name + aliases)) {
      setError("Thay nội dung đã che bằng tên kỹ năng và tên gọi khác không chứa thông tin liên hệ.");
      return;
    }
    if (
      edits &&
      tab === "skills" &&
      relations.some(
        (relation) =>
          !catalog?.skills.some(
            (skill) => skill.stableId === relation.targetSkillId && skill.stableId !== selected && skill.status === "ACTIVE"
          )
      )
    ) {
      setError("Mỗi quan hệ cần một kỹ năng đích đang hoạt động.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (tab === "categories") {
        await apiRequest(action === "CREATE" ? "/api/v2/dashboard/catalog" : `/api/v2/dashboard/catalog/${selected}`, {
          method: action === "CREATE" ? "POST" : "PUT",
          accessToken: session.accessToken,
          body: JSON.stringify(
            action === "CREATE"
              ? { kind, parentId: parent || null, name: name.trim(), reason: cleanReason }
              : {
                  version: currentCategory?.version,
                  action,
                  reason: cleanReason,
                  ...(edits ? { name: name.trim() } : {}),
                  mergeTargetId: action === "MERGE" ? target : null
                }
          )
        });
      } else {
        await apiRequest("/api/v2/taxonomy/skills", {
          method: "POST",
          accessToken: session.accessToken,
          body: JSON.stringify({
            version: catalog?.version,
            action,
            skillId: selected || null,
            reason: cleanReason,
            ...(edits
              ? {
                  name: name.trim(),
                  aliases: aliases
                    .split("\n")
                    .map((a) => a.trim())
                    .filter(Boolean),
                  type: skillType,
                  category: skillCategory,
                  relations
                }
              : {}),
            mergeTargetId: action === "MERGE" ? target : null
          })
        });
      }
      setLoadedTab(null);
      setAttempt((n) => n + 1);
      select("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được danh mục");
      if (e instanceof ApiClientError && e.status === 409) setNeedsReload(true);
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    setBusy(true);
    setError(null);
    try {
      setHistory(
        await apiRequest<HistoryEntry[]>(
          tab === "categories" ? `/api/v2/dashboard/catalog/${selected}/history` : `/api/v2/taxonomy/skills/${selected}/history`,
          { accessToken: session.accessToken }
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được lịch sử");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspaceShell
      variant="recruiter"
      activeItem={tab}
      brandLabel="Quản trị Hệ thống"
      eyebrow="Quản trị hệ thống"
      title={adminPageTitle[tab]}
      userLabel="Admin"
      onLogout={onLogout}
      onNavigate={(next) => {
        if (!busy) {
          select("");
          setNeedsReload(false);
          navigate(adminRouteMap[next]);
        }
      }}
      navItems={adminNavItems}
    >
      {tab === "companies" ? <CompanyReviewPanel accessToken={session.accessToken} /> : tab === "audit" ? (
        <AdminAuditPanel accessToken={session.accessToken} />
      ) : (
        <div className="space-y-5">
          <Card padding="sm" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink-600 m-0">
                  Thay đổi áp dụng cho dữ liệu xử lý mới. Các JD, CV và điểm đã lưu giữ nguyên phiên bản.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {catalog && tab === "skills" && (
                  <Badge tone="brand">Phiên bản taxonomy: {catalog.taxonomyVersion}</Badge>
                )}
                {(error || needsReload) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setReviewRequired(needsReload);
                      setNotice(
                        needsReload
                          ? "Bản nháp được giữ lại. Kiểm tra phiên bản và trạng thái mới trước khi lưu lại."
                          : null
                      );
                      setAttempt((n) => n + 1);
                    }}
                  >
                    Tải lại
                  </Button>
                )}
              </div>
            </div>

            {error && <ErrorBanner tone="error" message={error} />}
            {needsReload && (
              <p
                role="status"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 m-0"
              >
                Danh mục đã thay đổi. Tải lại trước khi lưu; bản nháp của bạn vẫn được giữ.
              </p>
            )}
            {notice && (
              <p
                role="status"
                className="rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs text-sky-900 m-0"
              >
                {notice}
              </p>
            )}
            {reviewRequired && !needsReload && loadedTab === tab && (
              <section aria-label="Đối chiếu phiên bản mới" className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900 m-0">
                  Dữ liệu đã thay đổi. Đối chiếu thông tin mới nhất bên dưới với bản nháp trước khi tiếp tục.
                </p>
                <dl className="grid gap-2 text-sm sm:grid-cols-2 m-0">
                  <div><dt>Phiên bản mới nhất</dt><dd className="ml-0">{tab === "skills" ? catalog?.version : currentCategory?.version ?? "Chưa chọn danh mục"}</dd></div>
                  {selected && <>
                    <div><dt>Tên mới nhất</dt><dd className="ml-0">{current?.name ?? "Danh mục không còn trong danh sách"}</dd></div>
                    <div><dt>Trạng thái mới nhất</dt><dd className="ml-0">{current ? catalogStatusLabel[current.status] ?? current.status : "Không còn khả dụng"}</dd></div>
                  </>}
                  {currentSkill && <>
                    <div><dt>Tên gọi khác mới nhất</dt><dd className="ml-0">{currentSkill.aliases.map(alias => alias.value).join(", ") || "Không có"}</dd></div>
                    <div><dt>Loại / nhóm mới nhất</dt><dd className="ml-0">{skillTypeLabel[currentSkill.type]} · {skillCategoryLabel[currentSkill.category]}</dd></div>
                    <div className="sm:col-span-2"><dt>Quan hệ mới nhất</dt><dd className="ml-0">{currentSkill.relations.map(relation => `${relationLabel[relation.type]}: ${catalog?.skills.find(entry => entry.stableId === relation.targetSkillId)?.canonicalName ?? relation.targetSkillId}`).join("; ") || "Không có"}</dd></div>
                  </>}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || Boolean(selected && !current)} onClick={() => {
                    setReviewRequired(false);
                    setNotice("Đã giữ bản nháp sau đối chiếu. Kiểm tra các giá trị trước khi lưu vào phiên bản mới.");
                  }}>Giữ bản nháp sau đối chiếu</Button>
                  {selected && current && <Button size="sm" variant="secondary" disabled={busy} onClick={() => {
                    const draftReason = reason;
                    select(selected);
                    setReason(draftReason);
                    setNotice("Đã điền dữ liệu mới nhất vào biểu mẫu; lý do của bạn được giữ lại.");
                  }}>Dùng dữ liệu mới nhất</Button>}
                </div>
              </section>
            )}
            {loadedTab !== tab && !error && (
              <p role="status" className="text-xs font-medium text-ink-500 m-0">
                Đang tải danh mục…
              </p>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_1fr] items-start">
            <aside ref={queueRef} className="space-y-4 min-w-0 scroll-mt-6">
              {tab === "categories" && (
                <Card padding="md" className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-ink-900 m-0">Danh mục nghề</h3>
                    <Badge tone="neutral">{entries.length} mục</Badge>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white">
                    <table className="w-full border-collapse text-left text-sm">
                      <caption className="sr-only">Danh mục nghề</caption>
                      <thead>
                        <tr className="border-b border-border-subtle bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                          <th className="px-4 py-2.5">Tên danh mục</th>
                          <th className="px-4 py-2.5">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {entries.map((entry) => (
                          <tr
                            key={entry.id}
                            className={cn(
                              "transition-colors hover:bg-slate-50/80",
                              entry.id === selected && "bg-brand-50/50"
                            )}
                          >
                            <td className="px-4 py-2.5">
                              <button
                                type="button"
                                aria-pressed={entry.id === selected}
                                disabled={busy || loadedTab !== tab}
                                onClick={() => select(entry.id)}
                                className="text-left text-sm font-semibold text-ink-900 hover:text-brand-700 cursor-pointer disabled:cursor-not-allowed"
                              >
                                {entry.name}
                              </button>
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                tone={
                                  entry.status === "ACTIVE"
                                    ? "success"
                                    : entry.status === "PENDING"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {catalogStatusLabel[entry.status] ?? entry.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {catalog && tab === "skills" && loadedTab === tab && (
                <PendingSkillQueue
                  accessToken={session.accessToken}
                  catalogVersion={catalog.version}
                  disabled={busy || needsReload || reviewRequired}
                  selected={selected}
                  onSelect={selectQueuedSkill}
                  types={skillTypes.map((value) => ({ value, label: skillTypeLabel[value] }))}
                  categories={skillCategories.map((value) => ({ value, label: skillCategoryLabel[value] }))}
                />
              )}
            </aside>

            <div ref={editorRef} className="space-y-4 min-w-0 scroll-mt-6">
              {selected && <Button variant="ghost" size="sm" className="xl:hidden" onClick={() => {
                (queueRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
                  ?? queueRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
                queueRef.current?.scrollIntoView?.({ block: "start" });
              }}>← Quay lại danh sách</Button>}
              {selected && catalog && tab === "skills" && (
                <Tabs
                  ariaLabel="Chi tiết kỹ năng"
                  activeId={skillPanel}
                  onChange={setSkillPanel}
                  items={[
                    { id: "edit", label: "Thông tin và duyệt" },
                    { id: "sources", label: "Nguồn kỹ năng" },
                    { id: "suggestions", label: "Gợi ý chuẩn hóa" }
                  ]}
                />
              )}
              <div hidden={tab === "skills" && skillPanel !== "edit"}>
                <AdminCatalogForm
                  tab={tab}
                  entries={entries}
                  categories={categories}
                  catalog={catalog}
                  selected={selected}
                  current={current}
                  active={active}
                  targets={targets}
                  kind={kind}
                  parent={parent}
                  name={name}
                  aliases={aliases}
                  skillType={skillType}
                  skillCategory={skillCategory}
                  relations={relations}
                  reason={reason}
                  target={target}
                  busy={busy}
                  loadedTab={loadedTab}
                  needsReload={needsReload || reviewRequired}
                  onSelect={(id) => select(id)}
                  onKindChange={setKind}
                  onParentChange={setParent}
                  onNameChange={setName}
                  onAliasesChange={setAliases}
                  onSkillTypeChange={setSkillType}
                  onSkillCategoryChange={setSkillCategory}
                  onRelationsChange={setRelations}
                  onReasonChange={setReason}
                  onTargetChange={setTarget}
                  onAction={(action) => void act(action)}
                  onLoadHistory={() => void loadHistory()}
                />
                {history && <CatalogChangeHistoryCard history={history} isSkillTab={tab === "skills"} />}
              </div>

              {selected && catalog && tab === "skills" && (
                <div hidden={skillPanel !== "sources"}>
                  <PendingSkillSources
                    key={`sources:${selected}`}
                    accessToken={session.accessToken}
                    selected={selected}
                    catalogVersion={catalog.version}
                    skills={catalog.skills}
                  />
                </div>
              )}

              {selected && catalog && tab === "skills" && (
                <div hidden={skillPanel !== "suggestions"}>
                  <SkillCandidateSuggestions
                    key={`candidates:${selected}`}
                    accessToken={session.accessToken}
                    selected={selected}
                    catalogVersion={catalog.version}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}

function AdminWorkspaceContent(props: { session: AuthSession; onLogout: () => void }) {
  const location = useLocation();
  const tab = resolveAdminTab(location.pathname, location.search);
  return <AdminWorkspaceEditor key={`${props.session.userId}:${tab}`} {...props} tab={tab} />;
}

/** Root Admin Workbench wrapped with router support for standalone test/embed mounts. */
export function AdminWorkspace(props: { session: AuthSession; onLogout: () => void }) {
  return (
    <EnsureRouter>
      <AdminWorkspaceContent {...props} />
    </EnsureRouter>
  );
}
