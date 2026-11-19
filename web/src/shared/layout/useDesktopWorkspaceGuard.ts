import { useEffect, useState } from "react";

export const DESKTOP_WORKSPACE_MIN_WIDTH = 1024;
const NARROW_VIEWPORT_QUERY = `(max-width: ${DESKTOP_WORKSPACE_MIN_WIDTH - 1}px)`;

/** Returns true only when the browser reports a viewport narrower than the desktop workspace threshold. */
export function isNarrowViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return Boolean(window.matchMedia(NARROW_VIEWPORT_QUERY)?.matches);
}

/** Subscribes to viewport width changes so desktop-only workspaces unlock automatically when widened. */
export function useIsNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState<boolean>(() => isNarrowViewport());

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(NARROW_VIEWPORT_QUERY);
    if (!mediaQuery) return;

    setNarrow(Boolean(mediaQuery.matches));
    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }
    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(onChange);
      return () => mediaQuery.removeListener(onChange);
    }
  }, []);

  return narrow;
}
