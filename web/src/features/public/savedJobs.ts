import { useEffect, useState } from "react";

export const SAVED_JOBS_STORAGE_KEY = "smart-recruitment-saved-jobs";
const SAVED_JOBS_EVENT = "smart-recruitment:saved-jobs-changed";

/** Reads bookmarked job IDs from localStorage safely. */
export function loadSavedJobs(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(SAVED_JOBS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) next[key] = true;
    }
    return next;
  } catch {
    return {};
  }
}

/** React hook sharing bookmarked job state across public portal views via localStorage. */
export function useSavedJobs() {
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>(() => loadSavedJobs());

  useEffect(() => {
    const sync = () => setSavedIds(loadSavedJobs());
    window.addEventListener("storage", sync);
    window.addEventListener(SAVED_JOBS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(SAVED_JOBS_EVENT, sync);
    };
  }, []);

  function toggleSaved(jobId: string) {
    setSavedIds((prev) => {
      const next = { ...prev };
      if (next[jobId]) {
        delete next[jobId];
      } else {
        next[jobId] = true;
      }
      try {
        window.localStorage.setItem(SAVED_JOBS_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(SAVED_JOBS_EVENT));
      } catch {
        // Ignore storage quota or private-mode errors
      }
      return next;
    });
  }

  return { savedIds, toggleSaved };
}
