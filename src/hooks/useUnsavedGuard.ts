import { useCallback, useEffect, useRef } from "react";

/**
 * Guard against losing an in-progress form.
 *
 * While `active` is true:
 *  - closing/reloading the tab shows the browser's native "leave site?" prompt
 *  - Escape (the app-wide go-back shortcut) and the browser Back button are
 *    intercepted and hand control to `onAttemptLeave` instead of navigating
 *
 * A single dummy history entry is kept in front of the page so Back lands on it
 * instead of leaving; `leaveViaBack` unwinds both entries when the user really
 * wants out.
 */
export function useUnsavedGuard(active: boolean, onAttemptLeave: () => void) {
  const cb = useRef(onAttemptLeave);
  cb.current = onAttemptLeave;
  const bypass = useRef(false);

  useEffect(() => {
    if (!active) return;
    bypass.current = false;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (bypass.current) return;
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
      if (bypass.current) return;
      // Re-arm the dummy entry so we stay put, then ask the user.
      window.history.pushState({ jmGuard: true }, "");
      cb.current();
    }

    window.history.pushState({ jmGuard: true }, "");
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [active]);

  /** Leave for real, going back past the guard's dummy entry. */
  const leaveViaBack = useCallback(() => {
    bypass.current = true;
    if (active) window.history.go(-2); else window.history.back();
  }, [active]);

  /** Leave for real via an explicit navigation (router push). */
  const leaveWith = useCallback((go: () => void) => {
    bypass.current = true;
    go();
  }, []);

  return { leaveViaBack, leaveWith };
}
