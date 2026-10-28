import { useSyncExternalStore } from "react";

const navigationEvent = "smarthire:navigate";
function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(navigationEvent, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(navigationEvent, listener);
  };
}

/** Presentation state only; credential and session ownership stays in auth. */
export function useUrlParams() {
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  function navigate(values: Record<string, string | null>, replace = false) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href === window.location.href) return;
    if (!window.dispatchEvent(new Event("smarthire:before-navigate", { cancelable: true }))) return;
    window.history[replace ? "replaceState" : "pushState"](null, "", url);
    window.dispatchEvent(new Event(navigationEvent));
  }
  return { params: new URLSearchParams(search), navigate };
}

export function useUrlView<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const { params, navigate } = useUrlParams();
  const requested = params.get(key) as T;
  const view = allowed.includes(requested) ? requested : fallback;
  return [view, (next: T) => navigate({ [key]: next })] as const;
}
