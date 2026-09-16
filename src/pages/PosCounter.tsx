import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { npr } from "@/lib/format";
import {
  fetchSharedHeldBills, claimSharedHeldBill, discardSharedHeldBill,
  loadPosDraft, draftHasContent, type SharedHeldBill,
} from "@/hooks/usePosDraft";

function ageLabel(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} hr${h === 1 ? "" : "s"} ago`;
}

export default function PosCounter() {
  const nav = useNavigate();
  const [bills, setBills] = useState<SharedHeldBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [discardTarget, setDiscardTarget] = useState<SharedHeldBill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setBills(await fetchSharedHeldBills());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const draft = loadPosDraft();
  const hasDraft = draftHasContent(draft);
  const draftLines = Array.isArray(draft?.state?.cart) ? draft!.state.cart.length : 0;
  const draftValue = (draft?.state?.cart ?? []).reduce((a: number, r: any) => a + Number(r.line_total ?? 0), 0);

  async function resume(b: SharedHeldBill) {
    if (!(await claimSharedHeldBill(b))) {
      toast.error("That bill was already picked up at another counter");
      return load();
    }
    nav("/pos");
  }

  async function discard(b: SharedHeldBill) {
    if (!(await discardSharedHeldBill(b))) return toast.error("Could not discard that bill");
    setDiscardTarget(null);
    toast.success("Bill discarded");
    load();
  }

  const groups = bills.reduce<Record<string, SharedHeldBill[]>>((acc, b) => {
    (acc[b.ownerName] ??= []).push(b);
    return acc;
  }, {});

  return (
    <AppLayout title="Counter" actions={
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
        <Button size="sm" onClick={() => nav("/pos")}><Plus className="mr-1 h-4 w-4" /> New sale</Button>
      </div>
    }>
      <p className="mb-4 text-sm text-muted-foreground">
        Every unfinished bill waiting at any counter. Bill numbers are only issued when a bill is
        posted, so nothing here holds a number. Resuming a bill moves it to this counter, so two
        people can never finish the same bill.
      </p>

      {hasDraft && (
        <Card className="mb-4 border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">On this counter</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3 text-sm">
            <div>
              <div className="font-medium">Unfinished bill</div>
              <div className="text-xs text-muted-foreground">
                {draftLines} item{draftLines === 1 ? "" : "s"} · {npr(draftValue)} · saved {ageLabel(draft!.savedAt)}
              </div>
            </div>
            <Button size="sm" onClick={() => nav("/pos")}>Continue</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Bills on hold ({bills.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : bills.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No bills are waiting.</p>
          ) : (
            Object.entries(groups).map(([owner, list]) => (
              <div key={owner} className="mb-5 last:mb-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-medium">{owner}</span>
                  <Badge variant="secondary">{list.length}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Waiting</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.label}</TableCell>
                        <TableCell className="text-right">{b.itemCount}</TableCell>
                        <TableCell className="text-right">{npr(b.total)}</TableCell>
                        <TableCell className="text-muted-foreground">{ageLabel(b.savedAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" onClick={() => resume(b)}>Resume</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDiscardTarget(b)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!discardTarget} onOpenChange={(v) => !v && setDiscardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              {discardTarget?.label} will be removed from the queue. Nothing has been posted, so no
              bill number or stock is affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => discardTarget && discard(discardTarget)}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
