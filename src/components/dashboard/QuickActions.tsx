import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, ShoppingCart, Wrench } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

export function QuickActions() {
  const { hasPermission } = usePermission();
  return (
    <div className="flex flex-wrap gap-3">
      {hasPermission("pos_create_sale") && (
        <Button asChild className="border-b-2 border-accent shadow-sm">
          <Link to="/pos">
            <Plus className="mr-1.5 h-4 w-4" /> New Sale
          </Link>
        </Button>
      )}
      {hasPermission("purchase_manage") && (
        <Button asChild variant="outline" className="bg-card shadow-sm">
          <Link to="/purchases">
            <ShoppingCart className="mr-1.5 h-4 w-4" /> New Purchase
          </Link>
        </Button>
      )}
      {hasPermission("repair_manage") && (
        <Button asChild variant="outline" className="bg-card shadow-sm">
          <Link to="/repairs">
            <Wrench className="mr-1.5 h-4 w-4" /> New Repair
          </Link>
        </Button>
      )}
    </div>
  );
}
