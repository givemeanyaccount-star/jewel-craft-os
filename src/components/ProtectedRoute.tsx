import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { AppRole, useAuth } from "@/hooks/useAuth";

interface Props {
  children: ReactNode;
  roles?: AppRole[];
}

export const ProtectedRoute = ({ children, roles }: Props) => {
  const { user, roles: userRoles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && !roles.some((r) => userRoles.includes(r))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-muted-foreground">
          You don't have permission to view this page. Required role: {roles.join(", ")}.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
