import { useMemo, useState } from "react";

import { ChevronDownIcon } from "../../shared/components/Icon";
import { Badge, Button, EmptyState, cn } from "../../shared/ui";
import { CategoryEntry } from "../recruiter/JobCategoryFields";
import { catalogStatusLabel, categoryLabel } from "./adminTypes";

export const ORPHAN_GROUP_ID = "__orphans__";

export type CategoryTreeNode = {
  id: string;
  entry: CategoryEntry | null;
  children: CategoryTreeNode[];
  pendingCount: number;
  directChildCount: number;
  isContextOnly: boolean;
};

type RawTreeResult = {
  nodes: CategoryTreeNode[];
  expandableIds: string[];
  summary: { industry: number; specialization: number; position: number };
};

type FlatTreeRow = {
  node: CategoryTreeNode;
  depth: number;
  hasVisibleChildren: boolean;
  isOpen: boolean;
};

function compareCategoryEntries(a: CategoryEntry, b: CategoryEntry): number {
  const aPending = a.status === "PENDING" ? 0 : 1;
  const bPending = b.status === "PENDING" ? 0 : 1;
  if (aPending !== bPending) return aPending - bPending;
  return a.name.localeCompare(b.name, "vi");
}

function buildRawCategoryTree(categories: CategoryEntry[]): RawTreeResult {
  const byId = new Map<string, CategoryEntry>(categories.map((c) => [c.id, c]));
  const childrenByParent = new Map<string, CategoryEntry[]>();
  const roots: CategoryEntry[] = [];
  const orphans: CategoryEntry[] = [];

  for (const entry of categories) {
    if (entry.kind === "INDUSTRY" && !entry.parentId) {
      roots.push(entry);
    } else if (entry.kind !== "INDUSTRY" && entry.parentId && entry.parentId !== entry.id && byId.has(entry.parentId)) {
      const list = childrenByParent.get(entry.parentId) ?? [];
      list.push(entry);
      childrenByParent.set(entry.parentId, list);
    } else {
      orphans.push(entry);
    }
  }

  roots.sort(compareCategoryEntries);
  orphans.sort(compareCategoryEntries);
  for (const list of childrenByParent.values()) {
    list.sort(compareCategoryEntries);
  }

  const visited = new Set<string>();
  const expandableIds: string[] = [];

  function toNode(entry: CategoryEntry, ancestors: Set<string>): CategoryTreeNode {
    visited.add(entry.id);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(entry.id);
    const childEntries = (childrenByParent.get(entry.id) ?? []).filter((child) => !nextAncestors.has(child.id));
    const children = childEntries.map((child) => toNode(child, nextAncestors));
    if (children.length > 0) {
      expandableIds.push(entry.id);
    }
    const pendingCount = (entry.status === "PENDING" ? 1 : 0) + children.reduce((sum, ch) => sum + ch.pendingCount, 0);
    return {
      id: entry.id,
      entry,
      children,
      pendingCount,
      directChildCount: children.length,
      isContextOnly: false
    };
  }

  const rootNodes = roots.map((entry) => toNode(entry, new Set()));
  const orphanNodes = orphans.map((entry) => toNode(entry, new Set()));

  for (const entry of categories) {
    if (!visited.has(entry.id)) {
      orphanNodes.push(toNode(entry, new Set()));
    }
  }

  const nodes: CategoryTreeNode[] = [...rootNodes];
  if (orphanNodes.length > 0) {
    nodes.push({
      id: ORPHAN_GROUP_ID,
      entry: null,
      children: orphanNodes,
      pendingCount: orphanNodes.reduce((sum, node) => sum + node.pendingCount, 0),
      directChildCount: orphanNodes.length,
      isContextOnly: false
    });
  }

  const summary = categories.reduce(
    (acc, entry) => {
      if (entry.kind === "INDUSTRY") acc.industry += 1;
      else if (entry.kind === "SPECIALIZATION") acc.specialization += 1;
      else acc.position += 1;
      return acc;
    },
    { industry: 0, specialization: 0, position: 0 }
  );

  return { nodes, expandableIds, summary };
}

function filterCategoryNodes(
  nodes: CategoryTreeNode[],
  matches: (c: CategoryEntry) => boolean,
  hasFilter: boolean
): CategoryTreeNode[] {
  function visit(node: CategoryTreeNode): CategoryTreeNode | null {
    const visibleChildren = node.children.map(visit).filter((child): child is CategoryTreeNode => child !== null);
    if (!node.entry) {
      return visibleChildren.length > 0 ? { ...node, children: visibleChildren } : null;
    }
    const selfMatches = matches(node.entry);
    if (!selfMatches && visibleChildren.length === 0) {
      return null;
    }
    return {
      ...node,
      children: visibleChildren,
      isContextOnly: hasFilter && !selfMatches
    };
  }

  return nodes.map(visit).filter((node): node is CategoryTreeNode => node !== null);
}

/** Builds and filters the 3-level category tree with orphan grouping and pending counts. */
export function buildCategoryTree(
  categories: CategoryEntry[],
  matches: (c: CategoryEntry) => boolean,
  hasFilter: boolean
): RawTreeResult {
  const raw = buildRawCategoryTree(categories);
  return {
    ...raw,
    nodes: filterCategoryNodes(raw.nodes, matches, hasFilter)
  };
}

function flattenVisibleTree(
  nodes: CategoryTreeNode[],
  overrides: Record<string, boolean>,
  hasFilter: boolean
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];

  function walk(list: CategoryTreeNode[], depth: number) {
    for (const node of list) {
      const hasVisibleChildren = node.children.length > 0;
      const isOpen = node.entry === null ? true : (overrides[node.id] ?? (hasFilter || node.pendingCount > 0));
      rows.push({ node, depth, hasVisibleChildren, isOpen });
      if (hasVisibleChildren && isOpen) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(nodes, 0);
  return rows;
}

function childCountSubtitle(entry: CategoryEntry, count: number): string | null {
  if (count === 0) return null;
  if (entry.kind === "INDUSTRY") return `${count} nhóm chuyên môn`;
  if (entry.kind === "SPECIALIZATION") return `${count} vị trí`;
  return null;
}

function statusBadgeTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "ACTIVE") return "success";
  if (status === "PENDING") return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}

/** Collapsible 3-level tree view (Industry -> Specialization -> Position) for admin category management. */
export function CategoryTree({
  categories,
  matches,
  hasFilter,
  selected,
  disabled,
  onOpen,
  onCreateChild
}: {
  categories: CategoryEntry[];
  matches: (c: CategoryEntry) => boolean;
  hasFilter: boolean;
  selected: string;
  disabled: boolean;
  onOpen: (id: string) => void;
  onCreateChild: (kind: "SPECIALIZATION" | "POSITION", parentId: string) => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const rawTree = useMemo(() => buildRawCategoryTree(categories), [categories]);
  const visibleNodes = useMemo(
    () => filterCategoryNodes(rawTree.nodes, matches, hasFilter),
    [rawTree.nodes, matches, hasFilter]
  );
  const rows = useMemo(
    () => flattenVisibleTree(visibleNodes, overrides, hasFilter),
    [visibleNodes, overrides, hasFilter]
  );

  function toggleNode(id: string, currentlyOpen: boolean) {
    setOverrides((prev) => ({ ...prev, [id]: !currentlyOpen }));
  }

  function setAllExpanded(expanded: boolean) {
    const next: Record<string, boolean> = {};
    for (const id of rawTree.expandableIds) {
      next[id] = expanded;
    }
    setOverrides(next);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Không có danh mục phù hợp"
        description="Thử thay đổi từ khóa hoặc bộ lọc cấp/trạng thái."
      />
    );
  }

  const { summary, expandableIds } = rawTree;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-600">
        <span className="font-medium">
          {summary.industry} ngành · {summary.specialization} nhóm · {summary.position} vị trí
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={expandableIds.length === 0}
            onClick={() => setAllExpanded(true)}
          >
            Mở rộng tất cả
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={expandableIds.length === 0}
            onClick={() => setAllExpanded(false)}
          >
            Thu gọn tất cả
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border-subtle bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Danh mục nghề</caption>
          <thead className="bg-slate-50 border-b border-border-subtle">
            <tr className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              <th className="px-4 py-2.5">Tên danh mục</th>
              <th className="px-3 py-2.5 whitespace-nowrap">Cấp</th>
              <th className="px-3 py-2.5 whitespace-nowrap">Trạng thái</th>
              <th className="px-4 py-2.5 text-right whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {rows.map(({ node, depth, hasVisibleChildren, isOpen }) => {
              const entry = node.entry;
              if (!entry) {
                return (
                  <tr key={node.id} className="bg-slate-50/70">
                    <td className="py-2.5 pr-4" style={{ paddingLeft: 16 + depth * 24 }}>
                      <span className="text-xs font-semibold uppercase tracking-wider text-ink-600">
                        Chưa phân nhóm
                      </span>
                    </td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5" />
                    <td className="px-4 py-2.5" />
                  </tr>
                );
              }

              const isSelected = entry.id === selected;
              const subtitle = childCountSubtitle(entry, node.directChildCount);

              return (
                <tr
                  key={entry.id}
                  className={cn(
                    "transition-colors hover:bg-slate-50/80",
                    isSelected && "bg-brand-50/60 border-l-4 border-l-brand-600"
                  )}
                >
                  <td className="py-2.5 pr-4" style={{ paddingLeft: 16 + depth * 24 }}>
                    <div className="flex items-start gap-2">
                      {hasVisibleChildren ? (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Thu gọn" : "Mở rộng"} ${entry.name}`}
                          onClick={() => toggleNode(entry.id, isOpen)}
                          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-slate-100 hover:text-ink-900 cursor-pointer"
                        >
                          <ChevronDownIcon size={14} className={cn("transition-transform", !isOpen && "-rotate-90")} />
                        </button>
                      ) : (
                        <span aria-hidden="true" className="inline-block h-5 w-5 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {node.isContextOnly ? (
                            <span
                              title="Hiển thị làm ngữ cảnh cho mục con khớp bộ lọc"
                              className="text-left text-sm font-semibold text-ink-900 opacity-60"
                            >
                              {entry.name}
                            </span>
                          ) : (
                            <button
                              type="button"
                              aria-pressed={isSelected}
                              disabled={disabled}
                              onClick={() => onOpen(entry.id)}
                              className="text-left text-sm font-semibold text-ink-900 hover:text-brand-700 cursor-pointer disabled:cursor-not-allowed"
                            >
                              {entry.name}
                            </button>
                          )}
                          {node.pendingCount > 0 && node.directChildCount > 0 && (
                            <Badge tone="warning">{node.pendingCount} chờ duyệt</Badge>
                          )}
                        </div>
                        {subtitle && (
                          <span className={cn("mt-0.5 block text-xs text-ink-500", node.isContextOnly && "opacity-60")}>
                            {subtitle}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td
                    className={cn(
                      "px-3 py-2.5 text-xs text-ink-600 whitespace-nowrap",
                      node.isContextOnly && "opacity-60"
                    )}
                  >
                    {categoryLabel[entry.kind]}
                  </td>

                  <td className={cn("px-3 py-2.5 whitespace-nowrap", node.isContextOnly && "opacity-60")}>
                    <Badge tone={statusBadgeTone(entry.status)}>
                      {catalogStatusLabel[entry.status] ?? entry.status}
                    </Badge>
                  </td>

                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {!node.isContextOnly && (
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {entry.kind === "INDUSTRY" && entry.status === "ACTIVE" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            aria-label={`Thêm nhóm chuyên môn vào ${entry.name}`}
                            onClick={() => onCreateChild("SPECIALIZATION", entry.id)}
                          >
                            + Nhóm
                          </Button>
                        )}
                        {entry.kind === "SPECIALIZATION" && entry.status === "ACTIVE" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={disabled}
                            aria-label={`Thêm vị trí vào ${entry.name}`}
                            onClick={() => onCreateChild("POSITION", entry.id)}
                          >
                            + Vị trí
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={disabled}
                          onClick={() => onOpen(entry.id)}
                        >
                          Chi tiết
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
