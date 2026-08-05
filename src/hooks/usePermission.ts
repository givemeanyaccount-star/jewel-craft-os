import { useMemo } from "react";
import { useAuth } from "./useAuth";
import { AppPermission, canWith } from "@/lib/permissions";

export function usePermission() {
  const { roles, permissionMatrix } = useAuth();

  return useMemo(() => {
    const has = (permission: AppPermission) => canWith(permissionMatrix, roles, permission);
    return {
      roles,
      permissionMatrix,
      hasPermission: has,
      hasAnyPermission: (permissions: AppPermission[]) => permissions.some(has),
      hasAllPermissions: (permissions: AppPermission[]) => permissions.every(has),
    };
  }, [roles, permissionMatrix]);
}
