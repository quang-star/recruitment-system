import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { CompanyIcon, HistoryIcon, LayersIcon, SecurityIcon, SlidersIcon } from "../../shared/components/Icon";
import { WorkspaceNavItem, WorkspaceShell } from "../../shared/layout/WorkspaceShell";
import { EnsureRouter, useSafeNavigate } from "../../shared/router";
import { Badge, Button, Card, ErrorBanner, Modal, Tabs, cn } from "../../shared/ui";
import { AccountSecurityPanel } from "../auth/AccountSecurityPanel";
import { CategoryEntry } from "../recruiter/JobCategoryFields";
import { AdminAuditPanel } from "./AdminAuditPanel";
import { CompanyReviewPanel } from "./CompanyReviewPanel";
import { AdminCatalogForm } from "./AdminCatalogForm";
import { CatalogChangeHistoryCard } from "./CatalogChangeHistoryCard";
import { CategoryTree } from "./CategoryTree";
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
  { id: "skills", label: "Kỹ năng / tên gọi khác", icon: <SlidersIcon size={18} /> },
  { id: "audit", label: "Nhật ký thay đổi", icon: <HistoryIcon size={18} /> },
  { id: "companies", label: "Duyệt công ty", icon: <CompanyIcon size={18} /> },
  { id: "security", label: "Bảo mật", icon: <SecurityIcon size={18} /> }
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
  const [catQuery, setCatQuery] = useState("");
  const [catKind, setCatKind] = useState<"" | CategoryEntry["kind"]>("");
  const [catStatus, setCatStatus] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoadedTab(null);
    if (tab === "audit" || tab === "companies" || tab === "security") {
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

  function openCreate() {
    if (busy) return;
    select("");
    setModalOpen(true);
  }

  function openCreateChild(childKind: "SPECIALIZATION" | "POSITION", parentId: string) {
    if (busy) return;
    select("");
    setKind(childKind);
    setParent(parentId);
    setModalOpen(true);
  }

  function openEdit(id: string) {
    if (busy || loadedTab !== tab) return;
    select(id);
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setNeedsReload(false);
    setReviewRequired(false);
  }

  async function selectQueuedSkill(id: string) {
    if (busy || needsReload || reviewRequired) return;
    if (id === selected) {
      setModalOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const latest = await apiRequest<SkillCatalog>("/api/v2/taxonomy/skills", { accessToken: session.accessToken });
      setCatalog(latest);
      select(id, latest);
      setModalOpen(true);
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
      setModalOpen(false);
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
      userLabel="Admin"
      accountRoleLabel="Quản trị viên"
      accountMenuItems={[
        {
          id: "security",
          label: "Bảo mật tài khoản",
          icon: <SecurityIcon size={16} />,
          active: tab === "security",
          onSelect: () => {
            if (!busy && navigate(adminRouteMap.security)) {
              select("");
              setNeedsReload(false);
            }
          }
        }
      ]}
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
      {tab === "security" ? (
        <AccountSecurityPanel session={session} onLogout={onLogout} />
      ) : tab === "companies" ? (
        <CompanyReviewPanel accessToken={session.accessToken} />
      ) : tab === "audit" ? (
        <AdminAuditPanel accessToken={session.accessToken} />
      ) : (
        (() => {
          const reloadButton =
            !modalOpen && (error || needsReload) ? (
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
            ) : null;

          const statusBanners = (
            <>
              {!modalOpen && error && <ErrorBanner tone="error" message={error} />}
              {!modalOpen && needsReload && (
                <p
                  role="status"
                  className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 m-0"
                >
                  Danh mục đã thay đổi. Tải lại trước khi lưu; bản nháp của bạn vẫn được giữ.
                </p>
              )}
              {!modalOpen && notice && (
                <p
                  role="status"
                  className="rounded-md border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs text-sky-900 m-0"
                >
                  {notice}
                </p>
              )}
              {loadedTab !== tab && !error && (
                <p role="status" className="text-xs font-medium text-ink-500 m-0">
                  Đang tải danh mục…
                </p>
              )}
            </>
          );

          return (
        <div className="space-y-5">
          <div className="space-y-4 min-w-0">
              {tab === "categories" && (() => {
                const categoryById = new Map(categories.map((c) => [c.id, c]));
                const q = catQuery.trim().toLowerCase();
                const matchCategory = (c: CategoryEntry) => {
                  if (catKind && c.kind !== catKind) return false;
                  if (catStatus && c.status !== catStatus) return false;
                  if (q) {
                    const parentName = c.parentId ? categoryById.get(c.parentId)?.name.toLowerCase() ?? "" : "";
                    if (!c.name.toLowerCase().includes(q) && !parentName.includes(q)) return false;
                  }
                  return true;
                };
                const filteredCategories = categories.filter(matchCategory);
                const pendingCount = categories.filter((c) => c.status === "PENDING").length;
                const hasFilter = Boolean(q || catKind || catStatus);
                return (
                  <Card padding="md" className="space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-ink-900 m-0">Danh mục nghề</h3>
                        <Badge tone="neutral">
                          {hasFilter ? `${filteredCategories.length}/${categories.length}` : `${entries.length} mục`}
                        </Badge>
                        {pendingCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setCatStatus((prev) => (prev === "PENDING" ? "" : "PENDING"))}
                            className={cn(
                              "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer",
                              catStatus === "PENDING"
                                ? "bg-amber-600 text-white"
                                : "bg-amber-100 text-amber-900 hover:bg-amber-200"
                            )}
                          >
                            {pendingCount} chờ duyệt
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {reloadButton}
                        <Button variant="primary" size="sm" disabled={busy} onClick={openCreate}>
                          + Thêm danh mục
                        </Button>
                      </div>
                    </div>
                    {statusBanners}

                    <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr] rounded-md border border-border-subtle bg-slate-50/70 p-2.5">
                      <input
                        type="search"
                        aria-label="Tìm danh mục nghề"
                        placeholder="Tìm theo tên hoặc danh mục cha…"
                        value={catQuery}
                        onChange={(e) => setCatQuery(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border-strong bg-white px-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      />
                      <select
                        aria-label="Lọc cấp danh mục"
                        value={catKind}
                        onChange={(e) => setCatKind(e.target.value as "" | CategoryEntry["kind"])}
                        className="h-9 w-full rounded-lg border border-border-strong bg-white px-2.5 text-xs font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      >
                        <option value="">Tất cả cấp</option>
                        <option value="INDUSTRY">Ngành</option>
                        <option value="SPECIALIZATION">Nhóm chuyên môn</option>
                        <option value="POSITION">Vị trí</option>
                      </select>
                      <select
                        aria-label="Lọc trạng thái danh mục"
                        value={catStatus}
                        onChange={(e) => setCatStatus(e.target.value)}
                        className="h-9 w-full rounded-lg border border-border-strong bg-white px-2.5 text-xs font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      >
                        <option value="">Tất cả trạng thái</option>
                        <option value="PENDING">Chờ duyệt</option>
                        <option value="ACTIVE">Đang hoạt động</option>
                        <option value="DEFERRED">Tạm hoãn</option>
                        <option value="REJECTED">Đã từ chối</option>
                        <option value="MERGED">Đã gộp</option>
                      </select>
                    </div>
                    {hasFilter && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setCatQuery("");
                            setCatKind("");
                            setCatStatus("");
                          }}
                          className="text-xs font-semibold text-brand-700 hover:underline cursor-pointer bg-transparent border-0 p-0"
                        >
                          Xóa bộ lọc danh mục
                        </button>
                      </div>
                    )}

                    <CategoryTree
                      categories={categories}
                      matches={matchCategory}
                      hasFilter={hasFilter}
                      selected={selected}
                      disabled={busy || loadedTab !== tab}
                      onOpen={openEdit}
                      onCreateChild={openCreateChild}
                    />
                  </Card>
                );
              })()}

              {tab === "skills" && catalog && loadedTab === tab ? (
                <PendingSkillQueue
                  accessToken={session.accessToken}
                  catalogVersion={catalog.version}
                  disabled={busy || needsReload || reviewRequired}
                  selected={selected}
                  onSelect={selectQueuedSkill}
                  types={skillTypes.map((value) => ({ value, label: skillTypeLabel[value] }))}
                  categories={skillCategories.map((value) => ({ value, label: skillCategoryLabel[value] }))}
                  headerBadges={
                    <>
                      <Badge tone="brand">Phiên bản taxonomy: {catalog.taxonomyVersion}</Badge>
                      <Badge tone="neutral">{catalog.skills.length} kỹ năng</Badge>
                    </>
                  }
                  headerActions={
                    <>
                      {reloadButton}
                      <Button variant="primary" size="sm" disabled={busy} onClick={openCreate}>
                        + Thêm kỹ năng mới
                      </Button>
                    </>
                  }
                  statusContent={statusBanners}
                />
              ) : tab === "skills" ? (
                <Card padding="md" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-ink-900 m-0">Hàng chờ kỹ năng</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      {reloadButton}
                      <Button variant="primary" size="sm" disabled={busy} onClick={openCreate}>
                        + Thêm kỹ năng mới
                      </Button>
                    </div>
                  </div>
                  {statusBanners}
                </Card>
              ) : null}
          </div>

          <Modal
            open={modalOpen}
            onClose={closeModal}
            size="xl"
            closeDisabled={busy}
            eyebrow={
              selected
                ? tab === "skills"
                  ? "Chỉnh sửa & duyệt kỹ năng"
                  : "Chỉnh sửa & duyệt danh mục"
                : tab === "skills"
                  ? "Thêm kỹ năng mới"
                  : "Thêm danh mục mới"
            }
            title={
              current
                ? current.name
                : tab === "skills"
                  ? "Tạo kỹ năng chuẩn hóa"
                  : "Tạo danh mục nghề"
            }
          >
            <div className="space-y-4 pt-4">
              {error && <ErrorBanner tone="error" message={error} />}
              {needsReload && (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-900"
                >
                  <span>Danh mục đã thay đổi. Tải lại trước khi lưu; bản nháp của bạn vẫn được giữ.</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setReviewRequired(true);
                      setNotice("Bản nháp được giữ lại. Kiểm tra phiên bản và trạng thái mới trước khi lưu lại.");
                      setAttempt((n) => n + 1);
                    }}
                  >
                    Tải lại
                  </Button>
                </div>
              )}
              {notice && (
                <p
                  role="status"
                  className="rounded-md border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs text-sky-900 m-0"
                >
                  {notice}
                </p>
              )}
              {reviewRequired && !needsReload && loadedTab === tab && (
                <section aria-label="Đối chiếu phiên bản mới" className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
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
              <div hidden={tab === "skills" && skillPanel !== "edit"} className="space-y-4">
                <AdminCatalogForm
                  embedded
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
                    onSelectMergeTarget={
                      active
                        ? (skillId, canonicalName) => {
                            setTarget(skillId);
                            setSkillPanel("edit");
                            setNotice(
                              `Đã chọn "${canonicalName}" làm đích gộp. Nhập lý do thay đổi và nhấn "Gộp danh mục" để hoàn tất.`
                            );
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </div>
          </Modal>
        </div>
          );
        })()
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
