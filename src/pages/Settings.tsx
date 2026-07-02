import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Settings() {
  const { hasRole } = useAuth();
  if (!(hasRole("admin") || hasRole("manager"))) return <AppLayout><p>Access denied.</p></AppLayout>;
  return (
    <AppLayout title="Settings">
      <div className="grid gap-4 md:grid-cols-2">
        <CategoriesEditor />
        <SimpleList table="locations" title="Showcase Locations" />
      </div>
    </AppLayout>
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
