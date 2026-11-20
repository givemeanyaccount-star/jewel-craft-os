import { useEffect, useRef } from "react";

export type PosShortcutAction = "search" | "hold" | "checkout";

/** Maps a key to a POS action; null when the key is not a shortcut. */
export function posShortcutFor(key: string): PosShortcutAction | null {
  if (key === "F2") return "search";
  if (key === "F4") return "hold";
  if (key === "F8") return "checkout";
  return null;
}

/** Shortcuts pause while any popup is open so they never act behind it. */
export function isDialogOpen(doc: Document = document): boolean {
  return !!doc.querySelector('[role="dialog"],[role="alertdialog"]');
}

export function usePosShortcuts(handlers: Record<PosShortcutAction, () => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = posShortcutFor(e.key);
      if (!action) return;
      e.preventDefault();
      if (isDialogOpen()) return;
      ref.current[action]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
