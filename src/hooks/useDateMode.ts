import { useSyncExternalStore } from "react";

export type DateMode = "AD" | "BS";
const KEY = "jm.dateMode";
const listeners = new Set<() => void>();

function read(): DateMode {
  try { return localStorage.getItem(KEY) === "BS" ? "BS" : "AD"; } catch { return "AD"; }
}

export function setDateMode(mode: DateMode) {
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useDateMode(): [DateMode, (m: DateMode) => void] {
  const mode = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => "AD" as DateMode,
  );
  return [mode, setDateMode];
}
