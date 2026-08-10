import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  AppPermission,
  AppRole,
  ALL_ROLES,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  RolePermissionMatrix,
} from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import AuditLog from "@/components/AuditLog";
import { Loader2, Plus, Trash2, RotateCcw, Pencil } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  username?: string | null;
  email?: string | null;
  last_sign_in_at?: string | null;
  roles: AppRole[];
}

const RoleManagement = () => {
  const { user: currentUser, signOut, permissionMatrix, reloadPermissions } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, phone, username").order("full_name"),
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

    let accounts: Record<string, { email?: string | null; last_sign_in_at?: string | null }> = {};
    const { data: fnData } = await supabase.functions.invoke("admin-users", { body: { action: "list" } });
    if (fnData?.users) {
      accounts = Object.fromEntries(
        fnData.users.map((u: any) => [u.id, { email: u.email, last_sign_in_at: u.last_sign_in_at }]),
      );
    }

    setUsers(
      (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        username: (p as any).username ?? null,
        email: accounts[p.id]?.email ?? null,
        last_sign_in_at: accounts[p.id]?.last_sign_in_at ?? null,
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
    const target = users.find((u) => u.id === userId);
    setPending(key);
    if (hasRole) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) {
        toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
      } else {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roles: u.roles.filter((r) => r !== role) } : u)));
        toast({ title: `Revoked ${role}` });
        await logAudit({
          action: "role_revoked",
          target_user_id: userId,
          target_email: target?.email ?? null,
          details: { role },
        });
      }
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) {
        toast({ title: "Assign failed", description: error.message, variant: "destructive" });
      } else {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roles: [...u.roles, role] } : u)));
        toast({ title: `Assigned ${role}` });
        await logAudit({
          action: "role_granted",
          target_user_id: userId,
          target_email: target?.email ?? null,
          details: { role },
        });
      }
    }
    setPending(null);
  };

  const removeUser = async (u: UserRow) => {
    setPending(`del:${u.id}`);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "delete", user_id: u.id },
    });
    setPending(null);
    setDeleteTarget(null);
    if (error || data?.error) {
      toast({ title: "Delete failed", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "User removed" });
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
  };


  const filtered = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.full_name ?? "").toLowerCase().includes(q) ||
      (u.phone ?? "").toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 p-4">
          <div>
            <h1 className="text-xl font-semibold">Users &amp; Permissions</h1>
            <p className="text-xs text-muted-foreground">Manage accounts, roles and what each role can do</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/">Home</Link></Button>
            <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        <PermissionMatrix matrix={permissionMatrix} reload={reloadPermissions} />
        <AuditLog />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Users</CardTitle>
            <AddUserDialog onCreated={load} />
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search by name, email or phone…"
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
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            {u.full_name || "(no name)"}
                            {isSelf && <Badge variant="outline" className="ml-2">you</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[u.username ? `@${u.username}` : null, u.email, u.phone].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {u.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          ) : (
                            u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)
                          )}
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
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
                          You can't revoke your own admin role or delete your own account (to avoid lockout).
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.full_name || deleteTarget?.email} will permanently lose access. Records they created
              stay in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && removeUser(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<AppRole[]>(["sales"]);

  const usernameValid = /^[a-zA-Z0-9._-]{3,30}$/.test(username.trim());

  const submit = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "create",
        email,
        username: username.trim(),
        full_name: fullName,
        phone,
        roles,
        redirect_to: `${window.location.origin}/reset-password`,
      },
    });
    setSaving(false);
    if (error || data?.error) {
      toast({ title: "Could not add user", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "Invitation sent", description: `${email} can set a password from the emailed link.` });
    setOpen(false);
    setEmail("");
    setUsername("");
    setFullName("");
    setPhone("");
    setRoles(["sales"]);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ramesh.k" />
              {username && !usernameValid && (
                <p className="text-xs text-destructive">3–30 characters: letters, numbers, . _ -</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@example.com" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Roles</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_ROLES.map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={roles.includes(r)}
                    onCheckedChange={(c) =>
                      setRoles((prev) => (c ? [...prev, r] : prev.filter((x) => x !== r)))
                    }
                  />
                  <span className="capitalize">{r}</span>
                </label>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The user signs in with their email and sets their own password from the emailed link. The username is a
            unique display handle.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !email.trim() || !usernameValid}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onSaved }: { user: UserRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState(user.email ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");

  useEffect(() => {
    if (!open) return;
    setEmail(user.email ?? "");
    setUsername(user.username ?? "");
    setFullName(user.full_name ?? "");
    setPhone(user.phone ?? "");
  }, [open, user]);

  const usernameValid = /^[a-zA-Z0-9._-]{3,30}$/.test(username.trim());

  const submit = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "update",
        user_id: user.id,
        email: email.trim(),
        username: username.trim(),
        full_name: fullName,
        phone,
      },
    });
    setSaving(false);
    if (error || data?.error) {
      toast({ title: "Could not save changes", description: data?.error ?? error?.message, variant: "destructive" });
      return;
    }
    toast({ title: "User updated" });
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Edit user">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
              {username && !usernameValid && (
                <p className="text-xs text-destructive">3–30 characters: letters, numbers, . _ -</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Changing the email changes the address this person signs in with.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !email.trim() || !usernameValid}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function PermissionMatrix({
  matrix,
  reload,
}: {
  matrix: RolePermissionMatrix;
  reload: () => Promise<void>;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  const setCell = async (role: AppRole, permission: AppPermission, allowed: boolean) => {
    if (role === "admin" && permission === "role_manage" && !allowed) {
      toast({
        title: "Not allowed",
        description: "Admins must keep role management to avoid locking everyone out.",
        variant: "destructive",
      });
      return;
    }
    const key = `${role}:${permission}`;
    setSaving(key);
    const { error } = await supabase
      .from("role_permissions")
      .upsert({ role, permission, allowed }, { onConflict: "role,permission" });
    setSaving(null);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    await reload();
    await logAudit({ action: "permission_changed", details: { role, permission, allowed } });
  };

  const resetDefaults = async () => {
    setSaving("reset");
    const rows = ALL_ROLES.flatMap((role) =>
      ALL_PERMISSIONS.map((permission) => ({
        role,
        permission,
        allowed: DEFAULT_ROLE_PERMISSIONS[role].includes(permission),
      })),
    );
    const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role,permission" });
    setSaving(null);
    if (error) {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
      return;
    }
    await reload();
    await logAudit({ action: "permissions_reset", details: {} });
    toast({ title: "Permissions reset to defaults" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Permission Matrix</CardTitle>
          <p className="text-xs text-muted-foreground">Tick a box to grant a role that capability</p>
        </div>
        <Button variant="outline" size="sm" onClick={resetDefaults} disabled={saving === "reset"}>
          {saving === "reset" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1 h-4 w-4" />}
          Reset defaults
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 text-left font-medium">Permission</th>
              {ALL_ROLES.map((r) => (
                <th key={r} className="py-2 text-center font-medium capitalize">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((p) => (
              <tr key={p} className="border-b last:border-0">
                <td className="py-2 text-muted-foreground">{p.replace(/_/g, " ")}</td>
                {ALL_ROLES.map((r) => {
                  const key = `${r}:${p}`;
                  const checked = (matrix[r] ?? []).includes(p);
                  return (
                    <td key={r} className="py-2 text-center">
                      <Checkbox
                        checked={checked}
                        disabled={saving === key || saving === "reset"}
                        onCheckedChange={(c) => setCell(r, p, !!c)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default RoleManagement;
