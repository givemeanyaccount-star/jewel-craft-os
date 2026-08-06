import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Printer } from "lucide-react";
import { npr, gms } from "@/lib/format";
import logoUrl from "@/assets/logo.png";
import { openPrintPreview } from "@/components/PrintPreview";


export default function PurchaseDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [purchase, setPurchase] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => { load(); }, [id]);
  async function load() {
    if (!id) return;
    const [p, it] = await Promise.all([
      supabase.from("purchases").select("*, suppliers(name, phone, address, city)").eq("id", id).single(),
      supabase.from("purchase_items").select("*").eq("purchase_id", id),
    ]);
    setPurchase(p.data);
    setItems(it.data ?? []);
  }

  function printReceipt() {
    const el = document.getElementById("purchase-print");
    if (!el) return;
    openPrintPreview({
      title: `Purchase ${purchase?.purchase_no ?? ""}`,
      fileName: `Purchase-${purchase?.purchase_no ?? ""}`,
      page: "a4",
      html: el.innerHTML,
      includeAppStyles: true,
      css: `.no-print{display:none!important} .print-only{display:block!important}`,
    });
  }

  if (!purchase) return <AppLayout><p>Loading...</p></AppLayout>;



  return (
    <AppLayout title={purchase.purchase_no} actions={
      <>
        <Button size="sm" variant="outline" onClick={() => nav(-1)} className="no-print"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
        <Button size="sm" variant="outline" onClick={printReceipt} className="no-print"><Printer className="mr-1 h-4 w-4" /> Print</Button>
      </>
    }>
      <div id="purchase-print">
      <div className="print-only mb-6 flex items-center justify-between border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="JewelMaster" className="h-14 w-14 object-contain" />
          <div>
            <div className="text-xl font-bold tracking-tight">JewelMaster</div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-600">Fine Jewellery · Kathmandu, Nepal</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Purchase Receipt</div>
          <div className="text-lg font-semibold">{purchase.purchase_no}</div>
          <div className="text-[10px] text-gray-600">{new Date(purchase.purchase_date).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="print-shell grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Purchase {purchase.purchase_no}</CardTitle>
            <div className="text-sm text-muted-foreground">
              Supplier: {purchase.suppliers?.name ?? "—"} {purchase.suppliers?.phone && `· ${purchase.suppliers.phone}`}
              {purchase.invoice_no && <> · Supplier Invoice: {purchase.invoice_no}</>}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Item</TableHead><TableHead>Metal</TableHead>
                <TableHead className="text-right">Net wt</TableHead><TableHead className="text-right">Rate/g</TableHead>
                <TableHead className="text-right">Making</TableHead><TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.item_name}</TableCell>
                    <TableCell className="capitalize">{it.metal} {it.purity}</TableCell>
                    <TableCell className="text-right">{gms(it.net_weight)}</TableCell>
                    <TableCell className="text-right">{npr(it.rate_per_gram)}</TableCell>
                    <TableCell className="text-right">{npr(it.making_charge)}</TableCell>
                    <TableCell className="text-right">{it.quantity}</TableCell>
                    <TableCell className="text-right font-medium">{npr(it.total_cost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {purchase.notes && <p className="mt-4 text-sm text-muted-foreground">Notes: {purchase.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payment status</span><span className="capitalize font-medium">{purchase.payment_status}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Items</span><span>{items.length}</span></div>
            <div className="rounded bg-secondary p-3 text-center">
              <div className="text-xs text-muted-foreground">Total Amount (paid in full)</div>
              <div className="text-2xl font-semibold">{npr(purchase.total_amount)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </AppLayout>
  );
}
