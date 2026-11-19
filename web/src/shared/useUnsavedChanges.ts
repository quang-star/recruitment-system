import { useEffect, useRef } from "react";

/** Keep review drafts alive when an in-app navigation would unmount the editor, allowing exit on the 3rd attempt. */
export function useUnsavedChanges(dirty: boolean, onBlocked: (attempt?: number) => void) {
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!dirty) {
      attemptsRef.current = 0;
      return;
    }
    const draftUrl = window.location.href;
    function unload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    function navigate(event: Event) {
      attemptsRef.current += 1;
      if (attemptsRef.current >= 3) {
        attemptsRef.current = 0;
        return;
      }
      event.preventDefault();
      onBlocked(attemptsRef.current);
    }
    function back(event: PopStateEvent) {
      if (window.location.href === draftUrl) return;
      attemptsRef.current += 1;
      if (attemptsRef.current >= 3) {
        attemptsRef.current = 0;
        return;
      }
      event.stopImmediatePropagation();
      window.history.pushState(null, "", draftUrl);
      onBlocked(attemptsRef.current);
    }
    window.addEventListener("beforeunload", unload);
    window.addEventListener("app:before-navigate", navigate);
    window.addEventListener("popstate", back, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("app:before-navigate", navigate);
      window.removeEventListener("popstate", back, true);
    };
  }, [dirty, onBlocked]);
}
