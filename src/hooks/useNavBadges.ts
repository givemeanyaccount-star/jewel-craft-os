import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import type { BadgeKey } from "@/lib/navConfig";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kathmandu" });

export function useNavBadges(): Partial<Record<BadgeKey, number>> {
  const { hasPermission } = usePermission();
  const [counts, setCounts] = useState<Partial<Record<BadgeKey, number>>>({});
  const canPos = hasPermission("pos_create_sale");
  const canInv = hasPermission("inventory_view");
  const canRep = hasPermission("repair_manage");
  const canOrd = hasPermission("order_view");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const d = today();
      const head = { count: "exact" as const, head: true };
      const [h, a, r, o] = await Promise.all([
        canPos ? supabase.from("pos_held_bills").select("id", head) : null,
        canInv ? supabase.from("inventory_weight_adjustments").select("id", head).eq("status", "pending") : null,
        canRep ? supabase.from("repairs").select("id", head).is("delivered_at", null).lte("expected_delivery", d) : null,
        canOrd ? supabase.from("orders").select("id", head).in("status", ["open", "in_production", "ready"]).lte("promised_date", d) : null,
      ]);
      if (!alive) return;
      setCounts({ held: h?.count ?? 0, adjustments: a?.count ?? 0, repairsDue: r?.count ?? 0, ordersDue: o?.count ?? 0 });
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [canPos, canInv, canRep, canOrd]);
  return counts;
}
