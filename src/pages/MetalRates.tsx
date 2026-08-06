import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, TrendingUp, Download, Search, X } from "lucide-react";
import { npr } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";

const METALS = ["gold", "silver", "platinum"];
const PURITIES = ["24K", "22K", "20K", "18K", "14K", "999", "925"];

export default function MetalRates() {
  const { hasRole, user } = useAuth();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("accountant");
  const [rates, setRates] = useState<any[]>([]);
  const [form, setForm] = useState({ metal: "gold", purity: "22K", rate_per_gram: "" });

  const [filter, setFilter] = useState({ metal: "all", purity: "all", search: "" });

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("metal_rates").select("*").order("effective_date", { ascending: false }).limit(100);
    setRates(data ?? []);
  }

  const filteredRates = useMemo(() => {
    return rates.filter((r) => {
      if (filter.metal !== "all" && r.metal !== filter.metal) return false;
      if (filter.purity !== "all" && r.purity !== filter.purity) return false;
      if (filter.search.trim()) {
        const q = filter.search.toLowerCase();
        const text = `${r.metal} ${r.purity} ${r.source ?? ""} ${r.effective_date ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [rates, filter]);

  async function add() {
    if (!form.rate_per_gram) return toast.error("Rate required");
    const { error } = await supabase.from("metal_rates").upsert({
      metal: form.metal as any, purity: form.purity,
      rate_per_gram: Number(form.rate_per_gram), created_by: user?.id,
      effective_date: new Date().toISOString().slice(0, 10),
      source: "manual",
    } as any, { onConflict: "metal,purity,effective_date" });
    if (error) return toast.error(error.message);
    toast.success("Rate saved"); setForm({ ...form, rate_per_gram: "" }); load();
  }

  const [fetching, setFetching] = useState(false);
  async function fetchFromFenegosida() {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-gold-rate");
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Synced ${(data as any).count} rates from ${(data as any).source}`);
      load();
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
    } finally { setFetching(false); }
  }


  return (
    <AppLayout title="Metal Rates">
      {canWrite && (
        <Card className="mb-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Set today's rate</CardTitle>
            <Button size="sm" variant="outline" onClick={fetchFromFenegosida} disabled={fetching}>
              <Download className="mr-1 h-4 w-4" /> {fetching ? "Syncing..." : "Sync from FENEGOSIDA"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div><Label>Metal</Label>
                <Select value={form.metal} onValueChange={(v) => setForm({ ...form, metal: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Purity</Label>
                <Select value={form.purity} onValueChange={(v) => setForm({ ...form, purity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PURITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Rate per gram (रू)</Label>
                <Input type="number" step="0.01" value={form.rate_per_gram} onChange={(e) => setForm({ ...form, rate_per_gram: e.target.value })} /></div>
              <div className="flex items-end"><Button className="w-full" onClick={add}><Plus className="mr-1 h-4 w-4" /> Save Rate</Button></div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Source: Federation of Nepal Gold &amp; Silver Dealers Association (FENEGOSIDA) — fine gold 9999 per 10g, converted to each purity.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rate History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Metal</Label>
                <Select value={filter.metal} onValueChange={(v) => setFilter({ ...filter, metal: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="All metals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All metals</SelectItem>
                    {METALS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Purity</Label>
                <Select value={filter.purity} onValueChange={(v) => setFilter({ ...filter, purity: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="All purities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All purities</SelectItem>
                    {PURITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Date, metal, purity..."
                    value={filter.search}
                    onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setFilter({ metal: "all", purity: "all", search: "" })}
            >
              <X className="mr-1 h-4 w-4" /> Clear
            </Button>
          </div>

          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Metal</TableHead><TableHead>Purity</TableHead><TableHead className="text-right">Rate / g</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredRates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    {rates.length === 0 ? "No rates yet" : "No rates match the selected filters"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{new Date(r.effective_date).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{r.metal}</TableCell>
                    <TableCell>{r.purity}</TableCell>
                    <TableCell className="text-right font-medium">{npr(r.rate_per_gram)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
