import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Guard against losing an in-progress form.
 *
 * While `active` is true:
 *  - closing/reloading the tab shows the browser's native "leave site?" prompt
 *  - Escape (the app-wide go-back shortcut) and the browser Back button are
 *    intercepted and hand control to `onAttemptLeave` instead of navigating
 */
export function useUnsavedGuard(active: boolean, onAttemptLeave: () => void) {
  const cb = useRef(onAttemptLeave);
  cb.current = onAttemptLeave;
  const [sentinel, setSentinel] = useState(false);

  useEffect(() => {
    if (!active) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    // Capture phase: runs before the global Escape-to-go-back handler, which
    // skips events that were already default-prevented.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      e.preventDefault();
      e.stopPropagation();
      cb.current();
    }
    function onPopState() {
      // Re-arm the sentinel so we stay on the page, then ask the user.
      window.history.pushState({ jmGuard: true }, "");
      cb.current();
    }

    window.history.pushState({ jmGuard: true }, "");
    setSentinel(true);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", onPopState);
      setSentinel(false);
    };
  }, [active]);

  /** Drop the guard's history sentinel right before navigating away for real. */
  const releaseGuard = useCallback(() => {
    if (sentinel && window.history.state?.jmGuard) window.history.back();
  }, [sentinel]);

  return { releaseGuard };
}
