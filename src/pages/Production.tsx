import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hammer, PackageCheck, AlertTriangle, Factory, Scale } from "lucide-react";
import { toast } from "sonner";
import { npr, gms, computeNetWeight, round2 } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { KarigarSelect, useKarigars } from "@/components/KarigarSelect";
import { cn } from "@/lib/utils";
import {
  fetchProductionBoard, issueToKarigar, receiveFromKarigar,
  ProductionRow, wastageGrams, makingChargeAmount, metalOwed,
} from "@/lib/production";

const OVERDUE_DAYS = 14;

export default function Production() {
  const { hasPermission } = usePermission();
  const canManage = hasPermission("order_manage");
  const [board, setBoard] = useState<{ toIssue: ProductionRow[]; inWorkshop: ProductionRow[]; received: ProductionRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [issueRow, setIssueRow] = useState<ProductionRow | null>(null);
  const [receiveRow, setReceiveRow] = useState<ProductionRow | null>(null);
  const [karigarFilter, setKarigarFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try { setBoard(await fetchProductionBoard()); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const karigarOptions = useMemo(() => {
    if (!board) return [];
    const map = new Map<string, string>();
    for (const r of board.inWorkshop) if (r.karigarId) map.set(r.karigarId, r.karigarName ?? "Unnamed");
    return Array.from(map.entries());
  }, [board]);

  const workshop = useMemo(() => {
    if (!board) return [];
    return karigarFilter === "all" ? board.inWorkshop : board.inWorkshop.filter((r) => r.karigarId === karigarFilter);
  }, [board, karigarFilter]);

  const totals = useMemo(() => {
    if (!board) return { outGrams: 0, overdue: 0, unsettled: 0 };
    return {
      outGrams: round2(board.inWorkshop.reduce((s, r) => s + r.issuedGrossWeight, 0)),
      overdue: board.inWorkshop.filter((r) => (r.daysHeld ?? 0) > OVERDUE_DAYS).length,
      unsettled: board.received.filter((r) => Math.abs(r.owedBack) > 0.001).length,
    };
  }, [board]);

  if (loading || !board) return <AppLayout title="Production"><p className="text-muted-foreground">Loading…</p></AppLayout>;

  return (
    <AppLayout title="Production">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={Scale} label="Metal in workshop" value={gms(totals.outGrams)} hint={`${board.inWorkshop.length} job(s) with karigars`} />
        <SummaryCard icon={AlertTriangle} label="Overdue" value={String(totals.overdue)} hint={`held over ${OVERDUE_DAYS} days`} tone={totals.overdue > 0 ? "warn" : undefined} />
        <SummaryCard icon={PackageCheck} label="Metal unsettled" value={String(totals.unsettled)} hint="received jobs not weight-balanced" tone={totals.unsettled > 0 ? "warn" : undefined} />
      </div>

      <Tabs defaultValue="issue">
        <TabsList>
          <TabsTrigger value="issue">To Issue ({board.toIssue.length})</TabsTrigger>
          <TabsTrigger value="workshop">In Workshop ({board.inWorkshop.length})</TabsTrigger>
          <TabsTrigger value="received">Received ({board.received.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="issue" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Order</TableHead><TableHead>Item</TableHead><TableHead>Metal</TableHead>
                <TableHead className="text-right">Expected wt</TableHead><TableHead>Promised</TableHead><TableHead className="w-24" />
              </TableRow></TableHeader>
              <TableBody>
                {board.toIssue.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nothing waiting to be issued.</TableCell></TableRow>
                ) : board.toIssue.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Link to={`/orders/${r.orderId}`} className="font-medium underline-offset-2 hover:underline">{r.orderNo}</Link><div className="text-xs text-muted-foreground">{r.customerName}</div></TableCell>
                    <TableCell className="max-w-[220px] truncate">{r.description}</TableCell>
                    <TableCell className="capitalize">{r.metal} {r.purity}</TableCell>
                    <TableCell className="text-right">{gms(r.expectedNetWeight)}</TableCell>
                    <TableCell><PromisedCell date={r.promisedDate} /></TableCell>
                    <TableCell>{canManage && <Button size="sm" onClick={() => setIssueRow(r)}><Hammer className="mr-1 h-3.5 w-3.5" /> Issue</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="workshop" className="mt-4">
          <div className="mb-3 flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Karigar:</Label>
            <Select value={karigarFilter} onValueChange={setKarigarFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All karigars</SelectItem>
                {karigarOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Order</TableHead><TableHead>Item</TableHead><TableHead>Karigar</TableHead>
                <TableHead className="text-right">Issued</TableHead><TableHead className="text-right">Wastage allow.</TableHead>
                <TableHead>Held</TableHead><TableHead className="w-28" />
              </TableRow></TableHeader>
              <TableBody>
                {workshop.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nothing in the workshop.</TableCell></TableRow>
                ) : workshop.map((r) => {
                  const overdue = (r.daysHeld ?? 0) > OVERDUE_DAYS;
                  return (
                    <TableRow key={r.id}>
                      <TableCell><Link to={`/orders/${r.orderId}`} className="font-medium underline-offset-2 hover:underline">{r.orderNo}</Link><div className="text-xs text-muted-foreground">{r.customerName}</div></TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                      <TableCell>{r.karigarName ?? "—"}</TableCell>
                      <TableCell className="text-right">{gms(r.issuedGrossWeight)}</TableCell>
                      <TableCell className="text-right">{gms(r.wastageAllowance)}</TableCell>
                      <TableCell><span className={cn(overdue && "font-medium text-destructive")}>{r.daysHeld}d</span></TableCell>
                      <TableCell>{canManage && <Button size="sm" variant="outline" onClick={() => setReceiveRow(r)}><PackageCheck className="mr-1 h-3.5 w-3.5" /> Receive</Button>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="received" className="mt-4">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Order</TableHead><TableHead>Item</TableHead><TableHead>Karigar</TableHead>
                <TableHead className="text-right">Issued</TableHead><TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Allowance</TableHead><TableHead className="text-right">Metal balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {board.received.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nothing received awaiting stocking.</TableCell></TableRow>
                ) : board.received.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Link to={`/orders/${r.orderId}`} className="font-medium underline-offset-2 hover:underline">{r.orderNo}</Link></TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.description}</TableCell>
                    <TableCell>{r.karigarName ?? "—"}</TableCell>
                    <TableCell className="text-right">{gms(r.issuedGrossWeight)}</TableCell>
                    <TableCell className="text-right">{gms(r.receivedNetWeight)}</TableCell>
                    <TableCell className="text-right">{gms(r.wastageAllowance)}</TableCell>
                    <TableCell className="text-right">
                      {Math.abs(r.owedBack) < 0.001
                        ? <Badge className="bg-emerald-200 text-emerald-900">settled</Badge>
                        : <span className="font-medium text-destructive">{gms(r.owedBack)} short</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
          <p className="mt-2 text-xs text-muted-foreground">
            Stock these into inventory from the order page. Metal balance = issued − received − wastage allowance; the allowance is metal paid to the karigar, so zero means fully settled.
          </p>
        </TabsContent>
      </Tabs>

      <IssueDialog row={issueRow} onOpenChange={(v) => !v && setIssueRow(null)} onDone={async () => { setIssueRow(null); await load(); }} />
      <ReceiveDialog row={receiveRow} onOpenChange={(v) => !v && setReceiveRow(null)} onDone={async () => { setReceiveRow(null); await load(); }} />
    </AppLayout>
  );
}

function SummaryCard({ icon: Icon, label, value, hint, tone }: { icon: any; label: string; value: string; hint: string; tone?: "warn" }) {
  return (
    <Card><CardContent className="p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className={cn("text-xl font-semibold", tone === "warn" && "text-destructive")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </CardContent></Card>
  );
}

function PromisedCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const overdue = new Date(date) < new Date();
  return <span className={cn(overdue && "font-medium text-destructive")}>{new Date(date).toLocaleDateString()}</span>;
}

function IssueDialog({ row, onOpenChange, onDone }: { row: ProductionRow | null; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { user } = useAuth();
  const { karigars, refresh } = useKarigars();
  const [karigarId, setKarigarId] = useState<string | null>(null);
  const [karigarName, setKarigarName] = useState("");
  const [gross, setGross] = useState<any>("");
  const [stone, setStone] = useState<any>("");
  const [wastageType, setWastageType] = useState<any>("percentage");
  const [wastageValue, setWastageValue] = useState<any>("");
  const [makingType, setMakingType] = useState<any>("per_gram");
  const [makingRate, setMakingRate] = useState<any>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setKarigarId(row.karigarId); setKarigarName(row.karigarName ?? "");
    setGross(row.expectedNetWeight || ""); setStone("");
    setWastageType(row.wastageType ?? "percentage");
    setWastageValue(row.wastageValue ?? "");
    setMakingType("per_gram"); setMakingRate("");
  }, [row]);

  // Prefill the karigar's own default terms when one is picked.
  useEffect(() => {
    if (!karigarId) return;
    supabase.from("karigars").select("making_rate_type, making_rate, default_wastage_type, default_wastage_value")
      .eq("id", karigarId).single()
      .then(({ data }) => {
        if (!data) return;
        if (data.making_rate_type) setMakingType(data.making_rate_type);
        if (Number(data.making_rate) > 0) setMakingRate(data.making_rate);
        if (data.default_wastage_type) setWastageType(data.default_wastage_type);
        if (Number(data.default_wastage_value) > 0) setWastageValue(data.default_wastage_value);
      });
  }, [karigarId]);

  if (!row) return null;

  const grossN = Number(gross) || 0;
  const allowance = wastageGrams(wastageType, Number(wastageValue) || 0, grossN);
  const expectedReturn = round2(grossN - allowance);

  async function save() {
    if (!karigarId && !karigarName.trim()) return toast.error("Select or name a karigar");
    if (grossN <= 0) return toast.error("Enter the weight being issued");
    setSaving(true);
    try {
      await issueToKarigar({
        orderItemId: row!.id, karigarId, karigarName,
        metal: row!.metal, purity: row!.purity,
        grossWeight: grossN, stoneWeight: Number(stone) || 0,
        wastageType, wastageValue: Number(wastageValue) || 0,
        makingType, makingRate: Number(makingRate) || 0,
        userId: user?.id,
      });
      toast.success("Metal issued");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Issue metal — {row.orderNo} · {row.description}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Karigar *</Label>
            <KarigarSelect karigars={karigars} value={karigarId} valueName={karigarName}
              onChange={(id, name) => { setKarigarId(id); setKarigarName(name); }} onKarigarCreated={refresh} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Gross weight issued (g) *</Label><Input type="number" step="0.001" value={gross} onChange={(e) => setGross(e.target.value)} /></div>
            <div><Label className="text-xs">Stone weight (g)</Label><Input type="number" step="0.001" value={stone} onChange={(e) => setStone(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Wastage paid to karigar</Label>
              <Select value={wastageType} onValueChange={setWastageType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">% of issued metal</SelectItem>
                  <SelectItem value="weight">Fixed grams</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Value</Label><Input type="number" step="0.001" value={wastageValue} onChange={(e) => setWastageValue(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Making charge basis</Label>
              <Select value={makingType} onValueChange={setMakingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_gram">Per gram finished</SelectItem>
                  <SelectItem value="percentage">% of metal value</SelectItem>
                  <SelectItem value="flat">Flat per piece</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Rate</Label><Input type="number" value={makingRate} onChange={(e) => setMakingRate(e.target.value)} /></div>
          </div>

          <div className="rounded border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Wastage allowance</span><span>{gms(allowance)}</span></div>
            <div className="mt-1 flex justify-between font-medium"><span>Expected piece weight back</span><span>{gms(expectedReturn)}</span></div>
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              The allowance is metal the karigar keeps as part of his pay, so a piece at or above this weight settles the job.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Issuing..." : "Issue Metal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ row, onOpenChange, onDone }: { row: ProductionRow | null; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const { user } = useAuth();
  const [gross, setGross] = useState<any>("");
  const [stone, setStone] = useState<any>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (row) { setGross(""); setStone(""); setNote(""); } }, [row]);
  if (!row) return null;

  const net = computeNetWeight(Number(gross) || 0, Number(stone) || 0);
  const balance = metalOwed(row.issuedGrossWeight, net, row.wastageAllowance);
  const making = makingChargeAmount(row.makingType, row.makingRate ?? 0, net, row.rate, row.quantity);

  async function save() {
    if ((Number(gross) || 0) <= 0) return toast.error("Enter the received weight");
    setSaving(true);
    try {
      await receiveFromKarigar({ row: row!, grossWeight: Number(gross) || 0, stoneWeight: Number(stone) || 0, note, userId: user?.id });
      toast.success("Piece received");
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Receive — {row.orderNo} · {row.description}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded border bg-muted/40 p-2 text-xs">
            <div><span className="block text-muted-foreground">Issued</span>{gms(row.issuedGrossWeight)}</div>
            <div><span className="block text-muted-foreground">Allowance</span>{gms(row.wastageAllowance)}</div>
            <div><span className="block text-muted-foreground">Karigar</span>{row.karigarName ?? "—"}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Gross weight received (g) *</Label><Input type="number" step="0.001" value={gross} onChange={(e) => setGross(e.target.value)} /></div>
            <div><Label className="text-xs">Stone weight (g)</Label><Input type="number" step="0.001" value={stone} onChange={(e) => setStone(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Note</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>

          <div className="rounded border p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Net piece weight</span><span>{gms(net)}</span></div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Metal balance</span>
              <span className={cn("font-medium", Math.abs(balance) > 0.001 && "text-destructive")}>
                {Math.abs(balance) < 0.001 ? "settled" : `${gms(balance)} short`}
              </span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-1"><span className="text-muted-foreground">Making charge earned</span><span>{npr(making)}</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Receive Piece"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
