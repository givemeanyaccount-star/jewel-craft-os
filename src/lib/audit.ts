import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "user_invited"
  | "user_removed"
  | "password_set"
  | "role_granted"
  | "role_revoked"
  | "permission_changed"
  | "permissions_reset";

export interface AuditEntry {
  action: AuditAction;
  target_user_id?: string | null;
  target_email?: string | null;
  details?: Record<string, unknown>;
}

/** Records an action in the audit log. Never throws — logging must not break the action. */
export async function logAudit(entry: AuditEntry) {
  try {
    const { data } = await supabase.auth.getUser();
    const actor = data.user;
    if (!actor) return;
    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      actor_email: actor.email ?? null,
      action: entry.action,
      target_user_id: entry.target_user_id ?? null,
      target_email: entry.target_email ?? null,
      details: (entry.details ?? {}) as never,
    });
  } catch {
    /* ignore */
  }
}

export const AUDIT_LABELS: Record<string, string> = {
  user_invited: "User invited",
  user_removed: "User removed",
  password_set: "Password set",
  role_granted: "Role granted",
  role_revoked: "Role revoked",
  permission_changed: "Permission changed",
  permissions_reset: "Permissions reset to defaults",
};
