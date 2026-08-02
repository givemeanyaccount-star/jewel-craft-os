import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { npr } from "@/lib/format";
import { CustomerDialog } from "@/components/CustomerDialog";

export default function Customers() {
  const { hasRole } = useAuth();
  const canWrite = hasRole("admin") || hasRole("manager") || hasRole("sales");
  const [customers, setCustomers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("customers").select("*").order("full_name").limit(500);
    setCustomers(data ?? []);
  }

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    if (!ql) return customers;
    return customers.filter((c) => [c.full_name, c.phone, c.email, c.id_doc_number].some((f) => (f ?? "").toLowerCase().includes(ql)));
  }, [customers, q]);

  return (
    <AppLayout title="Customers" actions={canWrite && (
      <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New Customer</Button>
    )}>
      <div className="mb-4 relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search by name, phone, email or ID..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <User className="h-10 w-10 opacity-40" />
          <p>No customers yet.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="transition hover:shadow-md cursor-pointer" onClick={() => canWrite && (setEditing(c), setOpen(true))}>
              <CardContent className="p-4">
                <div className="font-medium">{c.full_name}</div>
                <div className="text-sm text-muted-foreground">{c.phone || "—"} · {c.city || ""}</div>
                {c.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={Number(c.balance) > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>{npr(c.balance)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CustomerDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} />
    </AppLayout>
  );
}
