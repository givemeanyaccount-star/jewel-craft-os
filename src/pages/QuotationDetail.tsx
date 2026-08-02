import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Printer, FileCheck } from "lucide-react";
import { npr } from "@/lib/format";
import { toast } from "sonner";
import { lineDisplay } from "@/pages/POS";
import logoUrl from "@/assets/logo.png";

export default function QuotationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [q, setQ] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => { load(); }, [id]);
  async function load() {
    if (!id) return;
    const [qr, it] = await Promise.all([
      supabase.from("quotations").select("*, customers(*)").eq("id", id).single(),
      supabase.from("quotation_items").select("*").eq("quotation_id", id),
    ]);
    setQ(qr.data); setItems(it.data ?? []);
  }

  async function markAccepted() {
    const { error } = await supabase.from("quotations").update({ status: "accepted" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked accepted"); load();
  }

  if (!q) return <AppLayout><p>Loading...</p></AppLayout>;

  return (
    <AppLayout title={q.quote_number} actions={
      <>
        <Button size="sm" variant="outline" onClick={() => nav(-1)} className="no-print"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        {q.status !== "accepted" && (
          <Button size="sm" variant="outline" onClick={markAccepted} className="no-print"><FileCheck className="mr-1 h-4 w-4" /> Accept</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => window.print()} className="no-print"><Printer className="mr-1 h-4 w-4" /> Print</Button>
      </>
    }>
      {/* Print header */}
      <div className="print-only mb-6 flex items-center justify-between border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="JewelMaster" className="h-14 w-14 object-contain" />
          <div>
            <div className="text-xl font-bold tracking-tight">JewelMaster</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-600">Fine Jewellery · Kathmandu, Nepal</div>
            <div className="mt-1 text-[10px] text-gray-500">PAN 000000000 · +977 01-0000000</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Quotation</div>
          <div className="text-lg font-semibold">{q.quote_number}</div>
          <div className="text-[10px] text-gray-600">{new Date(q.created_at).toLocaleString()}</div>
          {q.valid_until && <div className="text-[10px] text-gray-600">Valid until: {new Date(q.valid_until).toLocaleDateString()}</div>}
        </div>
      </div>

      <div className="print-shell space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Quotation {q.quote_number}</CardTitle>
              <div className="mt-1 text-sm text-muted-foreground">
                {q.customers?.full_name ?? "Prospect"} · {new Date(q.created_at).toLocaleString()}
                {q.valid_until && <> · Valid until <strong>{new Date(q.valid_until).toLocaleDateString()}</strong></>}
              </div>
            </div>
            <Badge className="capitalize">{q.status}</Badge>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Purity</TableHead>
                  <TableHead className="text-right">Net Wt</TableHead>
                  <TableHead className="text-right">Wastage Wt</TableHead>
                  <TableHead className="text-right">Total Wt</TableHead>
                  <TableHead className="text-right">Rate/g</TableHead>
                  <TableHead className="text-right">Gold Amt</TableHead>
                  <TableHead className="text-right">Stone Amt</TableHead>
                  <TableHead className="text-right">Making</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map((r) => {
                    const d = lineDisplay(r);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.description}</div>
                          <div className="text-xs text-muted-foreground">{r.metal}{d.qty > 1 ? ` · ×${d.qty}` : ""}</div>
                        </TableCell>
                        <TableCell className="text-right">{r.purity ?? "-"}</TableCell>
                        <TableCell className="text-right">{d.netWt.toFixed(3)} g</TableCell>
                        <TableCell className="text-right">
                          <div>{d.wastageWt.toFixed(3)} g</div>
                          {r.wastage_type && (
                            <div className="text-[10px] text-muted-foreground">({formatBasis(r.wastage_type, r.wastage_input)})</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{d.totalWt.toFixed(3)} g</TableCell>
                        <TableCell className="text-right">{npr(d.rate)}</TableCell>
                        <TableCell className="text-right">{npr(d.goldAmt)}</TableCell>
                        <TableCell className="text-right">{npr(d.stoneAmt)}</TableCell>
                        <TableCell className="text-right">
                          <div>{npr(d.making)}</div>
                          {r.making_type && (
                            <div className="text-[10px] text-muted-foreground">({formatMaking(r.making_type, r.making_input)})</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{npr(d.rowTotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 ml-auto max-w-sm space-y-1.5 text-sm">
              <Row label="Subtotal" value={npr(q.subtotal)} />
              {Number(q.stones_total) > 0 && <Row label="  Stones (VAT-able)" value={npr(q.stones_total)} />}
              <Row label="Discount" value={`- ${npr(q.discount)}`} />
              {Number(q.vat_amount) > 0 && <Row label={`VAT ${q.vat_rate}% (stones only)`} value={npr(q.vat_amount)} />}
              {Number(q.sd_tax) > 0 && <Row label={`SD tax ${q.sd_tax_rate}% (gold + making − old gold)`} value={npr(q.sd_tax)} />}
              {Number(q.luxury_tax) > 0 && <Row label={`Luxury tax ${q.luxury_tax_rate}% (gold + making − old gold)`} value={npr(q.luxury_tax)} />}
              {Number(q.old_gold_credit) > 0 && <Row label="Old gold credit" value={`- ${npr(q.old_gold_credit)}`} />}
              <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{npr(q.total)}</span></div>
            </div>
            {q.notes && (
              <div className="mt-6 rounded border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</div>
                {q.notes}
              </div>
            )}
            <div className="mt-6 text-[10px] text-muted-foreground print:mt-8">
              This quotation is an estimate based on today's metal rates. Final invoice values may vary with rate movement. Gold and making charges are exempt from VAT; where applicable VAT applies to stones only. SD tax (0.5%) applies to gold + making − old gold value per Nepal tax rules.
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
function formatMaking(type: string, input: number | null | undefined) {
  const v = Number(input ?? 0);
  if (type === "per_gram") return `${v}/g`;
  if (type === "percentage") return `${v}% of metal`;
  return `fixed ${v}`;
}
function formatBasis(type: string, input: number | null | undefined) {
  const v = Number(input ?? 0);
  if (type === "percentage") return `${v}% of metal`;
  if (type === "weight") return `${v}g × rate`;
  return `fixed ${v}`;
}
