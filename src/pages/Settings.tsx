import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Settings() {
  const { hasRole } = useAuth();
  if (!(hasRole("admin") || hasRole("manager"))) return <AppLayout><p>Access denied.</p></AppLayout>;
  return (
    <AppLayout title="Settings">
      <div className="grid gap-4 md:grid-cols-2">
        <SimpleList table="categories" title="Jewellery Categories" />
        <SimpleList table="locations" title="Showcase Locations" />
      </div>
    </AppLayout>
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
