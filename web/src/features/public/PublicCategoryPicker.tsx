import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, SearchIcon } from "../../shared/components/Icon";
import { cn } from "../../shared/ui";
import { normalizeSearch } from "./jobPresentation";
import { JobDiscoveryCategory } from "./types";

export type CatalogCategoryEntry = {
  id: string;
  kind: "INDUSTRY" | "SPECIALIZATION" | "POSITION" | string;
  parentId?: string | null;
  name: string;
  status: string;
};

type IndustryGroup = {
  id: string;
  name: string;
  jobCount: number | null;
  specializations: Array<{
    id: string;
    name: string;
    jobCount: number | null;
  }>;
};

type Props = {
  catalogEntries: CatalogCategoryEntry[];
  discoveryCategories: JobDiscoveryCategory[];
  industryId: string;
  specializationId: string;
  onSelect: (next: { industryId: string | null; specializationId: string | null }) => void;
};

export function PublicCategoryPicker({
  catalogEntries,
  discoveryCategories,
  industryId,
  specializationId,
  onSelect
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [previewIndustryId, setPreviewIndustryId] = useState(industryId);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const groups = useMemo<IndustryGroup[]>(() => {
    const map = new Map<string, IndustryGroup>();
    const activeEntries = catalogEntries.filter((entry) => entry.status === "ACTIVE");

    for (const entry of activeEntries) {
      if (entry.kind === "INDUSTRY") {
        map.set(entry.id, { id: entry.id, name: entry.name, jobCount: null, specializations: [] });
      }
    }

    for (const entry of activeEntries) {
      if (entry.kind === "SPECIALIZATION" && entry.parentId) {
        const parent = map.get(entry.parentId);
        if (parent && !parent.specializations.some((item) => item.id === entry.id)) {
          parent.specializations.push({ id: entry.id, name: entry.name, jobCount: null });
        }
      }
    }

    for (const item of discoveryCategories) {
      let group = map.get(item.industryId);
      if (!group) {
        group = {
          id: item.industryId,
          name: item.specializationId ? "Khác" : item.name,
          jobCount: item.specializationId ? null : item.jobCount,
          specializations: []
        };
        map.set(item.industryId, group);
      }

      if (item.specializationId) {
        const existingSpec = group.specializations.find((spec) => spec.id === item.specializationId);
        if (existingSpec) {
          existingSpec.jobCount = item.jobCount;
        } else {
          group.specializations.push({
            id: item.specializationId,
            name: item.name,
            jobCount: item.jobCount
          });
        }
      } else {
        group.name = item.name;
        group.jobCount = item.jobCount;
      }
    }

    return Array.from(map.values());
  }, [catalogEntries, discoveryCategories]);

  const normalizedQuery = normalizeSearch(query.trim());

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => {
        const industryMatches = normalizeSearch(group.name).includes(normalizedQuery);
        const matchingSpecs = group.specializations.filter((spec) =>
          normalizeSearch(spec.name).includes(normalizedQuery)
        );
        if (!industryMatches && matchingSpecs.length === 0) return null;
        return {
          ...group,
          specializations: industryMatches ? group.specializations : matchingSpecs
        };
      })
      .filter((group): group is IndustryGroup => group !== null);
  }, [groups, normalizedQuery]);

  const activeGroup = useMemo(() => {
    if (!filteredGroups.length) return null;
    return (
      filteredGroups.find((group) => group.id === previewIndustryId) ??
      filteredGroups.find((group) => group.id === industryId) ??
      filteredGroups[0]
    );
  }, [filteredGroups, previewIndustryId, industryId]);

  useEffect(() => {
    if (!open) return;
    setPreviewIndustryId(industryId || groups[0]?.id || "");
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, industryId, groups]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selectedLabel = useMemo(() => {
    if (!industryId) return "Tất cả nhóm nghề";
    const group = groups.find((item) => item.id === industryId);
    if (!group) return "Nhóm nghề đã chọn";
    if (specializationId) {
      const spec = group.specializations.find((item) => item.id === specializationId);
      if (spec) return `${group.name} · ${spec.name}`;
    }
    return group.name;
  }, [groups, industryId, specializationId]);

  function applySelection(nextIndustryId: string | null, nextSpecId: string | null) {
    onSelect({ industryId: nextIndustryId, specializationId: nextSpecId });
    setOpen(false);
    setQuery("");
  }

  const isActive = Boolean(industryId);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Lọc theo nhóm nghề"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm transition-colors focus:border-brand-600 focus:outline-none cursor-pointer",
          isActive
            ? "border-brand-500 bg-brand-50/70 font-semibold text-brand-800"
            : "border-border-strong bg-white text-ink-900 hover:border-slate-400"
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDownIcon
          size={16}
          className={cn("shrink-0 text-ink-400 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Chọn ngành nghề và chuyên môn"
          className="absolute left-0 sm:right-0 sm:left-auto lg:left-0 lg:right-auto z-40 mt-1.5 w-full sm:w-[520px] max-w-[calc(100vw-2rem)] rounded-lg border border-border-subtle bg-white shadow-dialog overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-border-subtle p-2.5">
            <div className="relative flex-1 min-w-0">
              <SearchIcon
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Tìm nhanh ngành nghề hoặc chuyên môn"
                placeholder="Tìm ngành nghề, chuyên môn…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full rounded-md border border-border-strong bg-white pl-8 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none"
              />
            </div>
            {isActive && (
              <button
                type="button"
                onClick={() => applySelection(null, null)}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 cursor-pointer bg-transparent border-0"
              >
                Tất cả nhóm nghề
              </button>
            )}
          </div>

          {filteredGroups.length === 0 ? (
            <div className="p-5 text-center text-sm text-ink-500">
              Không tìm thấy ngành nghề phù hợp.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-12 max-h-80">
              <div
                aria-label="Danh sách nhóm ngành"
                className="sm:col-span-5 max-h-44 sm:max-h-80 overflow-y-auto border-b sm:border-b-0 sm:border-r border-border-subtle p-1.5 space-y-0.5"
              >
                {filteredGroups.map((group) => {
                  const isPreview = activeGroup?.id === group.id;
                  const isSelected = industryId === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onMouseEnter={() => setPreviewIndustryId(group.id)}
                      onClick={() => {
                        if (group.specializations.length === 0) {
                          applySelection(group.id, null);
                        } else {
                          setPreviewIndustryId(group.id);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer",
                        isPreview
                          ? "bg-brand-50 text-brand-800 font-semibold"
                          : isSelected
                            ? "bg-slate-100 text-ink-900 font-semibold"
                            : "text-ink-700 hover:bg-slate-50 hover:text-ink-900"
                      )}
                    >
                      <span className="truncate">{group.name}</span>
                      {group.specializations.length > 0 && (
                        <span className="text-xs text-ink-400 shrink-0" aria-hidden="true">
                          ›
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                aria-label="Danh sách chuyên môn"
                className="sm:col-span-7 max-h-52 sm:max-h-80 overflow-y-auto p-1.5 space-y-0.5 bg-slate-50/40"
              >
                {activeGroup && (
                  <>
                    <button
                      type="button"
                      onClick={() => applySelection(activeGroup.id, null)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer",
                        industryId === activeGroup.id && !specializationId
                          ? "bg-brand-50 text-brand-800 font-semibold"
                          : "text-ink-800 font-medium hover:bg-white"
                      )}
                    >
                      <span className="truncate">Tất cả trong {activeGroup.name}</span>
                      {activeGroup.jobCount != null && activeGroup.jobCount > 0 && (
                        <span className="rounded-sm bg-slate-200/80 px-1.5 py-0.5 text-xs font-semibold text-ink-700 tabular-nums-kpi shrink-0">
                          {activeGroup.jobCount}
                        </span>
                      )}
                    </button>

                    {activeGroup.specializations.length > 0 && (
                      <div className="border-t border-border-subtle my-1 pt-1 space-y-0.5">
                        {activeGroup.specializations.map((spec) => {
                          const selected =
                            industryId === activeGroup.id && specializationId === spec.id;
                          return (
                            <button
                              key={spec.id}
                              type="button"
                              onClick={() => applySelection(activeGroup.id, spec.id)}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors cursor-pointer",
                                selected
                                  ? "bg-brand-50 text-brand-800 font-semibold"
                                  : "text-ink-700 hover:bg-white hover:text-ink-900"
                              )}
                            >
                              <span className="truncate">{spec.name}</span>
                              {spec.jobCount != null && spec.jobCount > 0 && (
                                <span className="rounded-sm bg-slate-200/80 px-1.5 py-0.5 text-xs font-semibold text-ink-700 tabular-nums-kpi shrink-0">
                                  {spec.jobCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
