import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloudUpload, History, Loader2, RefreshCw } from "lucide-react";
import { npr } from "@/lib/format";
import type { ReturnStatus } from "@/lib/returns";
import type { QueuedReturn } from "@/lib/offlineReturns";

export interface ReturnRecord {
  id: string;
  invoice_id: string;
  credit_note_number: string | null;
  status: ReturnStatus;
  method: string;
  reason: string | null;
  gross: number;
  discount: number;
  tax_retained: number;
  total: number;
  refund_paid: number;
  processed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  invoices?: { invoice_number: string; issued_at: string; customers?: { full_name: string; phone: string | null } | null } | null;
  sales_return_items?: { id: string }[];
}

const BADGE: Record<ReturnStatus, "secondary" | "default" | "destructive"> = {
  draft: "secondary",
  processed: "default",
  voided: "destructive",
};

export function ReturnsHistory({
  refreshKey,
  busyId,
  onResume,
  onView,
  onVoid,
  onDiscard,
  canWrite,
  queued = [],
  syncing,
  onSyncNow,
  onRemoveQueued,
}: {
  refreshKey: number;
  busyId?: string | null;
  queued?: QueuedReturn[];
  syncing?: boolean;
  onSyncNow?: () => void;
  onRemoveQueued?: (q: QueuedReturn) => void;
  onResume: (r: ReturnRecord) => void;
  onView: (r: ReturnRecord) => void;
  onVoid: (r: ReturnRecord) => void;
  onDiscard: (r: ReturnRecord) => void;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"all" | ReturnStatus>("all");
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("sales_returns")
      .select("*, invoices(invoice_number, issued_at, customers(full_name, phone)), sales_return_items(id)")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as unknown as ReturnRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!s) return true;
      return [r.credit_note_number, r.invoices?.invoice_number, r.invoices?.customers?.full_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s));
    });
  }, [rows, status, q]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Returns history
        </CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-xs"
            placeholder="Search credit note, invoice or customer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {queued.length > 0 && (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CloudUpload className="h-4 w-4" /> Waiting to sync ({queued.length})
              </div>
              {onSyncNow && (
                <Button size="sm" variant="outline" onClick={onSyncNow} disabled={syncing}>
                  {syncing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-1 h-4 w-4" />} Sync now
                </Button>
              )}
            </div>
            <div className="divide-y">
              {queued.map((q) => (
                <div key={q.clientId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{q.invoiceNumber}</span>
                      <Badge variant={q.error ? "destructive" : "outline"} className="text-[10px]">
                        {q.error ? "Needs attention" : "Queued"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {q.customerName || "—"} · {q.selectedIds.length} item{q.selectedIds.length === 1 ? "" : "s"} ·{" "}
                      {new Date(q.queuedAt).toLocaleString()}
                      {q.error ? ` · ${q.error}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{npr(q.calc.total)}</span>
                    {onRemoveQueued && (
                      <Button size="sm" variant="ghost" onClick={() => onRemoveQueued(q)} disabled={!canWrite}>Remove</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No returns recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/60">
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Credit note</th>
                  <th className="px-3 py-2 font-medium">Invoice</th>
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Items</th>
                  <th className="px-3 py-2 text-right font-medium">Refund</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium">{r.credit_note_number ?? "—"}</td>
                    <td className="px-3 py-2">{r.invoices?.invoice_number ?? "—"}</td>
                    <td className="px-3 py-2">{r.invoices?.customers?.full_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.processed_at ?? r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">{r.sales_return_items?.length ?? 0}</td>
                    <td className="px-3 py-2 text-right">{npr(r.total)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={BADGE[r.status]} className="capitalize">{r.status}</Badge>
                      {r.status === "voided" && r.voided_at && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(r.voided_at).toLocaleDateString()}
                          {r.void_reason ? ` · ${r.void_reason}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        {r.status === "draft" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => onResume(r)} disabled={!canWrite}>Resume</Button>
                            <Button size="sm" variant="ghost" onClick={() => onDiscard(r)} disabled={!canWrite || busyId === r.id}>Discard</Button>
                          </>
                        )}
                        {r.status === "processed" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => onView(r)}>View / print</Button>
                            <Button size="sm" variant="ghost" onClick={() => onVoid(r)} disabled={!canWrite || busyId === r.id}>
                              {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Void"}
                            </Button>
                          </>
                        )}
                        {r.status === "voided" && <span className="text-xs text-muted-foreground">Reversed</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
