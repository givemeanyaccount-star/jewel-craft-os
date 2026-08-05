import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole, AppPermission, ALL_ROLES, RolePermissionMatrix, defaultMatrix } from "@/lib/permissions";

export type { AppRole };

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesError: string | null;
  permissionMatrix: RolePermissionMatrix;
  reloadPermissions: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionMatrix, setPermissionMatrix] = useState<RolePermissionMatrix>(defaultMatrix());

  const fetchPermissions = async () => {
    const { data, error } = await supabase.from("role_permissions").select("role, permission, allowed");
    if (error || !data) return;
    const next = ALL_ROLES.reduce((acc, r) => {
      acc[r] = [];
      return acc;
    }, {} as RolePermissionMatrix);
    data.forEach((row) => {
      if (!row.allowed) return;
      const role = row.role as AppRole;
      if (next[role]) next[role].push(row.permission as AppPermission);
    });
    setPermissionMatrix(next);
  };

  const fetchRoles = async (userId: string) => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error) {
      setRolesError(error.message);
      setRoles([]);
      return;
    }
    setRolesError(null);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => {
          fetchRoles(newSession.user.id);
          fetchPermissions();
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchPermissions();
        fetchRoles(s.user.id).finally(() => setLoading(false));
      }
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const hasRole = (role: AppRole) => roles.includes(role);
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, roles, loading, rolesError, permissionMatrix, reloadPermissions: fetchPermissions, hasRole, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
