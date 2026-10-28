import { useState } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const BACKUP_TABLES = ["customers", "inventory_items", "invoices", "invoice_items", "payments", "quotations",
  "quotation_items", "orders", "order_items", "order_item_receipts", "repairs", "repair_items",
  "old_gold_purchases", "purchases", "purchase_items", "suppliers", "karigars", "karigar_payments",
  "karigar_accruals", "sales_returns", "sales_return_items", "categories", "locations", "company_profile",
  "app_settings", "customer_advance_events"];

const LABELS: Record<string, string> = {
  customers: "Customers", inventory_items: "Stock items", invoices: "Sales bills", quotations: "Quotations",
  orders: "Orders", repairs: "Repairs", payments: "Payments & advances", purchases: "Purchases",
  old_gold_purchases: "Old metal purchases", karigars: "Karigars", suppliers: "Suppliers",
};

async function fnError(error: any): Promise<string> {
  try { const b = await error?.context?.json?.(); if (b?.error) return b.error; } catch { /* ignore */ }
  return error?.message ?? "Something went wrong";
}

export function ShopResetCard() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function start() {
    setOpen(true); setBackedUp(false); setPassword(""); setPhrase(""); setCounts(null);
    const { data, error } = await supabase.functions.invoke("shop-reset", { body: { action: "counts" } });
    if (error) { toast.error(await fnError(error)); setOpen(false); return; }
    setCounts(data.counts);
  }

  async function backup() {
    setBusy("backup");
    try {
      const wb = XLSX.utils.book_new();
      for (const t of BACKUP_TABLES) {
        const all: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase.from(t as any).select("*").range(from, from + 999);
          if (error) throw new Error(`${t}: ${error.message}`);
          all.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        const rows = all.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), t.slice(0, 31));
      }
      XLSX.writeFile(wb, `shop-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
      setBackedUp(true);
      toast.success("Backup downloaded — keep this file safe");
    } catch (e: any) { toast.error(`Backup failed, nothing was reset: ${e.message}`); }
    setBusy(null);
  }

  async function confirm() {
    setBusy("reset");
    const { data, error } = await supabase.functions.invoke("shop-reset", { body: { action: "confirm", password, phrase } });
    setBusy(null);
    if (error) return toast.error(await fnError(error));
    if (!data?.ok) return toast.error(data?.error ?? "Reset failed");
    toast.success("Shop data cleared — let's set up the new shop");
    setOpen(false);
    nav("/setup");
  }

  return (
    <Card className="border-destructive/50 md:col-span-2">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base text-destructive"><AlertTriangle className="h-5 w-5" /> Danger zone</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Reset shop data erases every customer, stock item, bill, order, repair, payment, purchase, karigar, the shop details and settings,
          for a fresh setup. Staff logins, roles and metal rate history are kept.
        </p>
        <Button variant="destructive" onClick={start}>Reset shop data…</Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-destructive">Reset shop data</DialogTitle></DialogHeader>
          {!counts ? <p className="text-sm text-muted-foreground">Counting records…</p> : (
            <div className="space-y-4 text-sm">
              <div className="rounded border p-2">
                <div className="mb-1 font-medium">This will permanently delete:</div>
                <div className="grid grid-cols-2 gap-x-4 text-xs">
                  {Object.entries(counts).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span>{LABELS[k] ?? k}</span><span className="font-medium">{v}</span></div>
                  ))}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">…plus all uploaded photos, shop details, settings, categories, locations, and bill numbering.</div>
              </div>
              <div>
                <div className="font-medium">Step 1 — Download a backup</div>
                <Button className="mt-1" variant="outline" onClick={backup} disabled={!!busy}>
                  {busy === "backup" ? "Preparing backup…" : backedUp ? "Backup downloaded ✓ (download again)" : "Download backup (Excel)"}
                </Button>
              </div>
              <div className={backedUp ? "" : "pointer-events-none opacity-50"}>
                <div className="font-medium">Step 2 — Confirm it's you</div>
                <Label className="mt-1 block text-xs">Your password</Label>
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Label className="mt-2 block text-xs">Type <strong>RESET SHOP</strong> to confirm</Label>
                <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={!!busy}>Cancel</Button>
            <Button variant="destructive" onClick={confirm}
              disabled={!backedUp || !password || phrase !== "RESET SHOP" || !!busy}>
              {busy === "reset" ? "Erasing…" : "Erase everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
