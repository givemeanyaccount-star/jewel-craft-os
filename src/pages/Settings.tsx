import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAppSettings } from "@/hooks/useAppSettings";
import { RecalcTaxesDialog } from "@/components/RecalcTaxesDialog";
import { CompanyProfileCard } from "@/components/CompanyProfileCard";
import { resetAllowCustomPurityCache } from "@/lib/purity";


export default function Settings() {
  const { hasPermission } = usePermission();
  if (!hasPermission("settings_manage")) return <AppLayout><p>Access denied.</p></AppLayout>;
  return (
    <AppLayout title="Settings">
      <div className="grid gap-4 md:grid-cols-2">
        <CompanyProfileCard />
        <TaxationCard />
        <CategoriesEditor />
        <SimpleList table="locations" title="Showcase Locations" />
      </div>

    </AppLayout>
  );
}

function TaxationCard() {
  const { settings, setSettings, loading, reload } = useAppSettings();
  const [saving, setSaving] = useState(false);
  const [recalcOpen, setRecalcOpen] = useState(false);

  async function save(next: { vat_enabled?: boolean; vat_rate?: number; sd_tax_rate?: number; allow_custom_purity?: boolean }) {
    const payload = {
      vat_enabled: next.vat_enabled ?? settings.vat_enabled,
      vat_rate: next.vat_rate ?? settings.vat_rate,
      sd_tax_rate: next.sd_tax_rate ?? settings.sd_tax_rate,
      allow_custom_purity: next.allow_custom_purity ?? settings.allow_custom_purity,
    };
    const changed =
      payload.vat_enabled !== settings.vat_enabled ||
      Number(payload.vat_rate) !== Number(settings.vat_rate) ||
      Number(payload.sd_tax_rate) !== Number(settings.sd_tax_rate);
    setSaving(true);
    let error;
    if (settings.id) {
      ({ error } = await supabase.from("app_settings").update(payload).eq("id", settings.id));
    } else {
      ({ error } = await supabase.from("app_settings").insert({ ...payload, purities: settings.purities }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    resetAllowCustomPurityCache(payload.allow_custom_purity);
    toast.success("Settings saved");
    await reload();
    if (changed) setRecalcOpen(true);
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle>Taxation</CardTitle>
        <p className="text-xs text-muted-foreground">
          VAT applies to the stones portion only. When disabled, no VAT is charged on any invoice or quotation. SD tax always applies to (gold + making + wastage − old gold credit).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded border p-3">
          <div>
            <Label htmlFor="vat-toggle" className="text-sm font-medium">VAT on stones</Label>
            <p className="text-xs text-muted-foreground">{settings.vat_enabled ? "Enabled" : "Disabled"}</p>
          </div>
          <Switch
            id="vat-toggle"
            disabled={loading || saving}
            checked={settings.vat_enabled}
            onCheckedChange={(v) => { setSettings({ ...settings, vat_enabled: v }); save({ vat_enabled: v }); }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">VAT rate (%)</Label>
            <NumberField
              disabled={!settings.vat_enabled || loading}
              value={settings.vat_rate}
              onChange={(v) => setSettings({ ...settings, vat_rate: v })}
              onBlur={() => save({ vat_rate: settings.vat_rate })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SD tax rate (%)</Label>
            <NumberField
              disabled={loading}
              value={settings.sd_tax_rate}
              onChange={(v) => setSettings({ ...settings, sd_tax_rate: v })}
              onBlur={() => save({ sd_tax_rate: settings.sd_tax_rate })}
            />
          </div>
        </div>
      </CardContent>
      <RecalcTaxesDialog open={recalcOpen} onOpenChange={setRecalcOpen} settings={settings} />
    </Card>
  );
}



function CategoriesEditor() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");

  async function load() {
    const { data } = await supabase.from("categories").select("*").order("name");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const n = name.trim(); const p = prefix.trim().toUpperCase();
    if (!n) return toast.error("Name required");
    if (!p) return toast.error("Prefix required (e.g. RNG)");
    const { error } = await supabase.from("categories").insert({ name: n, sku_prefix: p });
    if (error) return toast.error(error.message);
    setName(""); setPrefix(""); load();
  }
  async function updatePrefix(id: string, newPrefix: string) {
    const { error } = await supabase.from("categories")
      .update({ sku_prefix: newPrefix.trim().toUpperCase() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Prefix updated"); load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jewellery Categories</CardTitle>
        <p className="text-xs text-muted-foreground">Each category gets a unique SKU prefix (e.g. RNG-00001) used when auto-generating item codes.</p>
      </CardHeader>
      <CardContent>
        <div className="mb-3 grid grid-cols-[1fr_100px_auto] gap-2">
          <Input placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Prefix" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={5} />
          <Button onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Prefix</TableHead><TableHead>Next</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <PrefixRow key={r.id} row={r} onSave={updatePrefix} onDelete={remove} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PrefixRow({ row, onSave, onDelete }: any) {
  const [val, setVal] = useState(row.sku_prefix ?? "");
  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        <Input className="h-8 w-24" value={val} onChange={(e) => setVal(e.target.value.toUpperCase())} maxLength={5} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{val}-{String(row.next_sequence ?? 1).padStart(5, "0")}</TableCell>
      <TableCell className="text-right">
        {val !== row.sku_prefix && (
          <Button size="icon" variant="ghost" onClick={() => onSave(row.id, val)}><Save className="h-4 w-4" /></Button>
        )}
        <Button size="icon" variant="ghost" onClick={() => onDelete(row.id)}><Trash2 className="h-4 w-4" /></Button>
      </TableCell>
    </TableRow>
  );
}

function SimpleList({ table, title }: { table: "categories" | "locations"; title: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const { data } = await supabase.from(table).select("*").order("name");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from(table).insert({ name: name.trim() });
    if (error) return toast.error(error.message);
    setName(""); load();
  }
  async function remove(id: string) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-2">
          <Input placeholder="New name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
