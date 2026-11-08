export type PrintDiagnostic = {
  bill: string;
  time: string;
  kind: "image" | "print" | "pdf";
  detail: string;
};
const KEY = "jm.printDiagnostics.v1";
export const PRINT_DIAGNOSTICS_EVENT = "jm-print-diagnostics";

export function readPrintDiagnostics(bill: string): PrintDiagnostic[] {
  try {
    const rows: PrintDiagnostic[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(rows) ? rows.filter((r) => r.bill === bill) : [];
  } catch { return []; }
}

export function recordPrintDiagnostic(bill: string, kind: PrintDiagnostic["kind"], detail: string) {
  // Never retain signed image URLs, query strings, or arbitrary browser error contents.
  const safeDetail = detail.replace(/(?:https?:\/\/|blob:|data:)[^\s]+/gi, "[image address]").slice(0, 300);
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    const rows = Array.isArray(stored) ? stored : [];
    rows.push({ bill, kind, detail: safeDetail, time: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-300)));
  } catch { /* Printing remains available when browser storage is unavailable. */ }
  window.dispatchEvent(new Event(PRINT_DIAGNOSTICS_EVENT));
}