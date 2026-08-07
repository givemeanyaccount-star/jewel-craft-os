import { supabase } from "@/integrations/supabase/client";
import { getCachedInvoice } from "@/lib/offlineReturns";

export type ScanResult =
  | { kind: "line"; itemId: string; label: string }
  | { kind: "invoice"; invoiceId: string; label: string }
  | { kind: "none"; reason: string };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Codes stored alongside a cached invoice line, if we captured them. */
export function codesForItem(item: any): string[] {
  const raw = Array.isArray(item?.__codes) ? item.__codes : [];
  return raw.map(norm).filter(Boolean);
}

/** Fetch the SKU/barcode/QR of every inventory item linked to these invoice lines. */
export async function fetchLineCodes(items: any[]): Promise<Record<string, string[]>> {
  const ids = Array.from(new Set(items.map((i) => i.inventory_item_id).filter(Boolean)));
  if (!ids.length) return {};
  const { data } = await supabase
    .from("inventory_items")
    .select("id, sku, barcode, qr_code")
    .in("id", ids as string[]);
  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    map[row.id] = [row.sku, row.barcode, row.qr_code].filter(Boolean) as string[];
  }
  return map;
}

/** Attach codes to invoice lines so scanning keeps working from the offline cache. */
export function withCodes(items: any[], codes: Record<string, string[]>) {
  return items.map((it) => ({ ...it, __codes: codes[it.inventory_item_id] ?? it.__codes ?? [] }));
}

function matchLocally(code: string, items: any[]): string | null {
  const c = norm(code);
  const byCode = items.find((it) => codesForItem(it).includes(c));
  if (byCode) return byCode.id;
  const byDesc = items.find((it) => norm(it.description) === c);
  return byDesc?.id ?? null;
}

/**
 * Resolve a scanned code against the loaded invoice lines, falling back to a
 * lookup of the inventory item and (when no invoice is open) the invoice itself.
 */
export async function resolveScannedCode(
  code: string,
  opts: { items: any[]; online: boolean; hasInvoice: boolean }
): Promise<ScanResult> {
  const raw = code.trim();
  if (!raw) return { kind: "none", reason: "Empty scan" };
  const c = norm(raw);

  // 1. Match against the lines already on screen (works offline).
  const localId = matchLocally(raw, opts.items);
  if (localId) {
    const it = opts.items.find((i) => i.id === localId);
    return { kind: "line", itemId: localId, label: it?.description ?? raw };
  }

  if (!opts.online) {
    return {
      kind: "none",
      reason: opts.hasInvoice
        ? `"${raw}" isn't on this invoice (offline lookup only)`
        : `"${raw}" isn't available offline`,
    };
  }

  // 2. Resolve the code to an inventory item.
  const { data: inv } = await supabase
    .from("inventory_items")
    .select("id, name, sku")
    .or(`sku.eq.${raw},barcode.eq.${raw},qr_code.eq.${raw}`)
    .limit(1)
    .maybeSingle();

  if (inv) {
    const onInvoice = opts.items.find((it) => it.inventory_item_id === inv.id);
    if (onInvoice) return { kind: "line", itemId: onInvoice.id, label: onInvoice.description ?? inv.name };
    if (opts.hasInvoice) return { kind: "none", reason: `${inv.sku ?? raw} is not on this invoice` };

    // No invoice open — find the most recent invoice that sold this item.
    const { data: line } = await supabase
      .from("invoice_items")
      .select("invoice_id, invoices!inner(id, invoice_number, status, issued_at)")
      .eq("inventory_item_id", inv.id)
      .neq("invoices.status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (line?.invoice_id) {
      return { kind: "invoice", invoiceId: line.invoice_id, label: (line as any).invoices?.invoice_number ?? "" };
    }
    return { kind: "none", reason: `${inv.sku ?? raw} has no sales invoice to return against` };
  }

  // 3. Treat the code as an invoice number.
  if (!opts.hasInvoice) {
    const { data: byNumber } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("invoice_number", raw)
      .neq("status", "cancelled")
      .limit(1)
      .maybeSingle();
    if (byNumber) return { kind: "invoice", invoiceId: byNumber.id, label: byNumber.invoice_number };
  }

  return { kind: "none", reason: `No item or invoice matches "${raw}"` };
}
