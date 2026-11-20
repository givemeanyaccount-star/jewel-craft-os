import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";

export function PendingAdjustmentsNotice() {
  const { hasPermission } = usePermission();
  const enabled = hasPermission("inventory_adjust_approve");
  const q = useQuery({ queryKey: ["weight-adjustments-pending-count"], enabled, refetchInterval: 120000, queryFn: async () => {
    const { count } = await supabase.from("inventory_weight_adjustments").select("id", { count: "exact", head: true }).eq("status", "pending");
    return count ?? 0;
  } });
  if (!enabled || !q.data) return null;
  return (
    <Link to="/inventory-adjustments" className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm hover:bg-destructive/10">
      <Scale className="h-5 w-5 text-destructive" />
      <span><b>{q.data}</b> flagged weight adjustment{q.data > 1 ? "s" : ""} waiting for approval</span>
    </Link>
  );
}
