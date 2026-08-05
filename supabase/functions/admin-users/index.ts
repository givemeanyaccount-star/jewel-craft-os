import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);

    const admin = createClient(url, serviceKey);

    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (roleErr) return json({ error: roleErr.message }, 500);
    if (!(roleRows ?? []).some((r) => r.role === "admin")) {
      return json({ error: "Admin role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return json({ error: error.message }, 500);
      return json({
        users: data.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
        })),
      });
    }

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      const phone = String(body.phone ?? "").trim();
      const roles: string[] = Array.isArray(body.roles) ? body.roles : [];
      const redirectTo = String(body.redirect_to ?? "");
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return json({ error: "A valid email is required" }, 400);
      }
      if (fullName.length > 255 || phone.length > 40) {
        return json({ error: "Name or phone too long" }, 400);
      }

      const { data: created, error: createErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, phone },
        redirectTo: redirectTo || undefined,
      });
      if (createErr || !created?.user) return json({ error: createErr?.message ?? "Create failed" }, 400);

      const newId = created.user.id;
      await admin.from("profiles").upsert({ id: newId, full_name: fullName, phone });
      if (roles.length > 0) {
        await admin.from("user_roles").delete().eq("user_id", newId);
        await admin
          .from("user_roles")
          .insert(roles.map((role) => ({ user_id: newId, role })));
      }
      return json({ id: newId, email });
    }

    if (action === "delete") {
      const targetId = String(body.user_id ?? "");
      if (!targetId) return json({ error: "user_id is required" }, 400);
      if (targetId === userData.user.id) return json({ error: "You cannot delete your own account" }, 400);

      const { count } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      const { data: targetRoles } = await admin.from("user_roles").select("role").eq("user_id", targetId);
      const targetIsAdmin = (targetRoles ?? []).some((r) => r.role === "admin");
      if (targetIsAdmin && (count ?? 0) <= 1) {
        return json({ error: "Cannot remove the last admin" }, 400);
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
