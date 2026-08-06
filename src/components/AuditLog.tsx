import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUDIT_LABELS } from "@/lib/audit";
import { RefreshCw } from "lucide-react";

interface LogRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const describe = (row: LogRow) => {
  const d = (row.details ?? {}) as Record<string, any>;
  switch (row.action) {
    case "role_granted":
    case "role_revoked":
      return `${d.role ?? ""} — ${row.target_email ?? row.target_user_id ?? ""}`;
    case "permission_changed":
      return `${d.role ?? ""} · ${String(d.permission ?? "").replace(/_/g, " ")} → ${d.allowed ? "allowed" : "denied"}`;
    case "user_invited":
      return `${row.target_email ?? ""}${d.username ? ` (@${d.username})` : ""}${
        Array.isArray(d.roles) && d.roles.length ? ` · ${d.roles.join(", ")}` : ""
      }`;
    case "user_removed":
      return row.target_email ?? row.target_user_id ?? "";
    case "password_set":
      return row.target_email ?? "";
    default:
      return Object.keys(d).length ? JSON.stringify(d) : "";
  }
};

const AuditLog = () => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("id, actor_email, action, target_email, target_user_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as unknown as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [r.actor_email, r.target_email, r.action, describe(r)]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Audit log</CardTitle>
          <p className="text-xs text-muted-foreground">Invites, password setups, role and permission changes, removals</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Search actions, actors or users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto rounded-md border">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="sticky top-0 bg-muted/60">
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                  <th className="px-3 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{AUDIT_LABELS[r.action] ?? r.action}</Badge>
                    </td>
                    <td className="px-3 py-2">{describe(r)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.actor_email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AuditLog;
