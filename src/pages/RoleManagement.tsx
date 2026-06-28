import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";

const ALL_ROLES: AppRole[] = ["admin", "manager", "sales", "karigar", "accountant"];

interface UserRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  roles: AppRole[];
}

const RoleManagement = () => {
  const { user: currentUser, signOut } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, phone").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr || rErr) {
      toast({ title: "Failed to load users", description: (pErr ?? rErr)?.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const byUser = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      byUser.set(r.user_id, arr);
    });
    setUsers(
      (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        roles: byUser.get(p.id) ?? [],
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (userId: string, role: AppRole, hasRole: boolean) => {
    const key = `${userId}:${role}`;
    setPending(key);
    if (hasRole) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) {
        toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
      } else {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roles: u.roles.filter((r) => r !== role) } : u)));
        toast({ title: `Revoked ${role}` });
      }
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) {
        toast({ title: "Assign failed", description: error.message, variant: "destructive" });
      } else {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roles: [...u.roles, role] } : u)));
        toast({ title: `Assigned ${role}` });
      }
    }
    setPending(null);
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (u.full_name ?? "").toLowerCase().includes(q) || (u.phone ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-4">
          <div>
            <h1 className="text-xl font-semibold">Role Management</h1>
            <p className="text-xs text-muted-foreground">Assign or revoke roles for any user</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/">Home</Link></Button>
            <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found.</p>
            ) : (
              <div className="space-y-3">
                {filtered.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <div key={u.id} className="rounded-lg border bg-card p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            {u.full_name || "(no name)"}
                            {isSelf && <Badge variant="outline" className="ml-2">you</Badge>}
                          </div>
                          {u.phone && <div className="text-xs text-muted-foreground">{u.phone}</div>}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          ) : (
                            u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {ALL_ROLES.map((role) => {
                          const has = u.roles.includes(role);
                          const key = `${u.id}:${role}`;
                          const disabled = pending === key || (isSelf && role === "admin" && has);
                          return (
                            <label
                              key={role}
                              className={`flex items-center gap-2 rounded-md border p-2 text-sm ${
                                disabled ? "opacity-60" : "cursor-pointer hover:bg-accent"
                              }`}
                            >
                              <Checkbox
                                checked={has}
                                disabled={disabled}
                                onCheckedChange={() => toggle(u.id, role, has)}
                              />
                              <span className="capitalize">{role}</span>
                            </label>
                          );
                        })}
                      </div>
                      {isSelf && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          You can't revoke your own admin role (to avoid lockout).
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default RoleManagement;
