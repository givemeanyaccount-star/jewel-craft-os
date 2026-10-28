import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle } from "lucide-react";
import { todayISO } from "@/lib/orders";

/** Guided first-time setup after a fresh install or a shop reset. */
export default function SetupChecklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const [{ data: cp }, { count: cats }, { count: locs }, { count: rates }, { data: st }, { count: items }] = await Promise.all([
        supabase.from("company_profile").select("name_en, logo_url").limit(1).maybeSingle(),
        supabase.from("categories").select("id", { count: "exact", head: true }),
        supabase.from("locations").select("id", { count: "exact", head: true }),
        supabase.from("metal_rates").select("id", { count: "exact", head: true }).eq("effective_date", todayISO()),
        supabase.from("app_settings").select("updated_at, created_at, go_live_date").limit(1).maybeSingle(),
        supabase.from("inventory_items").select("id", { count: "exact", head: true }),
      ]);
      setDone({
        shop: !!cp?.name_en?.trim(),
        tax: !!st && st.updated_at !== st.created_at,
        cats: (cats ?? 0) > 0 && (locs ?? 0) > 0,
        rates: (rates ?? 0) > 0,
        golive: !!(st as any)?.go_live_date,
        import: (items ?? 0) > 0,
      });
    })();
  }, []);

  const steps = [
    { k: "shop", title: "Shop details and logo", desc: "Name, address, PAN, phones, logo and bill terms.", to: "/settings" },
    { k: "tax", title: "VAT and tax settings", desc: "Turn VAT on or off and check the SD tax rate.", to: "/settings" },
    { k: "cats", title: "Categories and showcase locations", desc: "Add your item categories and where stock is kept.", to: "/settings" },
    { k: "rates", title: "Today's metal rates", desc: "Enter or fetch today's gold and silver rates.", to: "/rates" },
    { k: "golive", title: "Go-live date", desc: "The day this shop starts billing in this app.", to: "/import" },
    { k: "import", title: "Bring over old records", desc: "Stock items and past bills from the old software.", to: "/import" },
  ];

  return (
    <AppLayout title="Set up the shop">
      <div className="mx-auto max-w-2xl space-y-3">
        {steps.map((s, i) => (
          <Card key={s.k}>
            <CardContent className="flex items-center gap-3 p-4">
              {done[s.k] ? <CheckCircle2 className="h-6 w-6 shrink-0 text-primary" /> : <Circle className="h-6 w-6 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">{i + 1}. {s.title}</div>
                <div className="text-sm text-muted-foreground">{s.desc}</div>
              </div>
              <Button asChild size="sm" variant={done[s.k] ? "outline" : "default"}><Link to={s.to}>{done[s.k] ? "Review" : "Open"}</Link></Button>
            </CardContent>
          </Card>
        ))}
        <div className="text-right"><Button asChild variant="ghost"><Link to="/">Done — go to dashboard</Link></Button></div>
      </div>
    </AppLayout>
  );
}
