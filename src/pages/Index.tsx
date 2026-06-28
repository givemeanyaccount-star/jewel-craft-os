import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  const { user, roles, hasRole, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-semibold">JewelMaster OS</h1>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasRole("admin") && (
              <Button asChild variant="outline" size="sm"><Link to="/admin/roles">Manage roles</Link></Button>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Your roles</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {roles.length === 0 ? (
              <span className="text-sm text-muted-foreground">No roles assigned yet.</span>
            ) : (
              roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-sm text-muted-foreground">
          Authentication and role-based access are wired up. Inventory, POS, and ERP modules come next.
        </p>
      </main>
    </div>
  );
};

export default Index;
