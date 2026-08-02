import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VAT_RATE, SD_TAX_RATE } from "@/lib/format";

export interface AppSettings {
  id: string | null;
  vat_enabled: boolean;
  vat_rate: number;
  sd_tax_rate: number;
  purities: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: null,
  vat_enabled: true,
  vat_rate: VAT_RATE,
  sd_tax_rate: SD_TAX_RATE,
  purities: ["24K", "22K", "20K", "18K", "14K", "9K", "999", "925"],
};

export async function fetchAppSettings(): Promise<AppSettings> {
  const { data } = await supabase.from("app_settings").select("*").limit(1).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    id: data.id,
    vat_enabled: !!data.vat_enabled,
    vat_rate: Number(data.vat_rate ?? VAT_RATE),
    sd_tax_rate: Number(data.sd_tax_rate ?? SD_TAX_RATE),
    purities: (data.purities as string[] | null)?.length ? (data.purities as string[]) : DEFAULT_SETTINGS.purities,
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    setSettings(await fetchAppSettings());
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  return { settings, setSettings, loading, reload };
}
