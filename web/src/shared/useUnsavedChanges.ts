import { useEffect } from "react";

/** Keep review drafts alive when an in-app navigation would unmount the editor. */
export function useUnsavedChanges(dirty: boolean, onBlocked: () => void) {
  useEffect(() => {
    if (!dirty) return;
    const draftUrl = window.location.href;
    function unload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    function navigate(event: Event) { event.preventDefault(); onBlocked(); }
    function back(event: PopStateEvent) {
      if (window.location.href === draftUrl) return;
      event.stopImmediatePropagation();
      window.history.pushState(null, "", draftUrl);
      onBlocked();
    }
    window.addEventListener("beforeunload", unload);
    window.addEventListener("smarthire:before-navigate", navigate);
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("smarthire:before-navigate", navigate);
      window.removeEventListener("popstate", back, true);
    };
  }, [dirty, onBlocked]);
}
