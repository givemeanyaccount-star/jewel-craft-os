import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { AppPermission, can, canAny } from "@/lib/permissions";

export function usePermission() {
  const { roles } = useAuth();

  return useMemo(() => {
    return {
      roles,
      hasPermission: (permission: AppPermission) => can(roles, permission),
      hasAnyPermission: (permissions: AppPermission[]) => canAny(roles, permissions),
      hasAllPermissions: (permissions: AppPermission[]) =>
        permissions.every((p) => can(roles, p)),
    };
  }, [roles]);
}
