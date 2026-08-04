import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { computeInvoiceTaxes, npr } from "@/lib/format";
import type { AppSettings } from "@/hooks/useAppSettings";

const OPEN_INVOICE_STATUSES = ["draft", "issued", "partial"] as const;
const OPEN_QUOTE_STATUSES = ["draft", "sent"] as const;

interface Doc {
  id: string;
  label: string;
  subtotal: number;
  stones_total: number;
  discount: number;
  old_gold_credit: number;
  total: number;
  amount_paid?: number;
}

export function RecalcTaxesDialog({
  open, onOpenChange, settings,
}: { open: boolean; onOpenChange: (v: boolean) => void; settings: AppSettings }) {
  const [invoices, setInvoices] = useState<Doc[]>([]);
  const [quotes, setQuotes] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [inv, q] = await Promise.all([
        supabase.from("invoices")
          .select("id, invoice_number, subtotal, stones_total, discount, old_gold_credit, total, amount_paid")
          .in("status", [...OPEN_INVOICE_STATUSES]),
        supabase.from("quotations")
          .select("id, quote_number, subtotal, stones_total, discount, old_gold_credit, total")
          .in("status", [...OPEN_QUOTE_STATUSES]),
      ]);
      setInvoices((inv.data ?? []).map((r: any) => ({
        id: r.id, label: r.invoice_number, subtotal: Number(r.subtotal ?? 0),
        stones_total: Number(r.stones_total ?? 0), discount: Number(r.discount ?? 0),
        old_gold_credit: Number(r.old_gold_credit ?? 0), total: Number(r.total ?? 0),
        amount_paid: Number(r.amount_paid ?? 0),
      })));
      setQuotes((q.data ?? []).map((r: any) => ({
        id: r.id, label: r.quote_number, subtotal: Number(r.subtotal ?? 0),
        stones_total: Number(r.stones_total ?? 0), discount: Number(r.discount ?? 0),
        old_gold_credit: Number(r.old_gold_credit ?? 0), total: Number(r.total ?? 0),
      })));
      setLoading(false);
    })();
  }, [open, settings.vat_enabled, settings.vat_rate, settings.sd_tax_rate]);

  function recomputed(d: Doc) {
    return computeInvoiceTaxes({
      subtotal: d.subtotal,
      stonesTotal: d.stones_total,
      discount: d.discount,
      oldGoldCredit: d.old_gold_credit,
      vatRate: settings.vat_rate,
      vatEnabled: settings.vat_enabled,
      sdTaxRate: settings.sd_tax_rate,
    });
  }

  const affectedInvoices = invoices.filter((d) => Math.abs(recomputed(d).total - d.total) > 0.01);
  const affectedQuotes = quotes.filter((d) => Math.abs(recomputed(d).total - d.total) > 0.01);
  const count = affectedInvoices.length + affectedQuotes.length;

  async function apply() {
    setSaving(true);
    try {
      for (const d of affectedInvoices) {
        const t = recomputed(d);
        const { error } = await supabase.from("invoices").update({
          vat_rate: settings.vat_enabled ? settings.vat_rate : 0,
          vat_amount: t.vat,
          sd_tax_rate: settings.sd_tax_rate,
          sd_tax: t.sdTax,
          total: t.total,
          balance_due: Math.max(0, t.total - (d.amount_paid ?? 0)),
        }).eq("id", d.id);
        if (error) throw error;
      }
      for (const d of affectedQuotes) {
        const t = recomputed(d);
        const { error } = await supabase.from("quotations").update({
          vat_rate: settings.vat_enabled ? settings.vat_rate : 0,
          vat_amount: t.vat,
          sd_tax_rate: settings.sd_tax_rate,
          sd_tax: t.sdTax,
          total: t.total,
        }).eq("id", d.id);
        if (error) throw error;
      }
      toast.success(`Recalculated ${count} document${count === 1 ? "" : "s"}`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Recalculation failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply new tax settings to open documents?</DialogTitle>
          <DialogDescription>
            Paid, cancelled and refunded invoices are never changed — they keep the tax that was charged.
            Only open invoices (draft, issued, partial) and open quotations (draft, sent) can be recalculated.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Checking documents…</p>
        ) : count === 0 ? (
          <p className="text-sm text-muted-foreground">No open documents are affected by this change.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto rounded border p-2 text-sm">
            {[...affectedInvoices, ...affectedQuotes].map((d) => {
              const t = recomputed(d);
              return (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {npr(d.total)} → <span className="text-foreground">{npr(t.total)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Keep as they are
          </Button>
          <Button onClick={apply} disabled={saving || loading || count === 0}>
            {saving ? "Recalculating…" : `Recalculate ${count || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
