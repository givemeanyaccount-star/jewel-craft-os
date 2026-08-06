import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { uploadImage, getSignedUrls } from "@/lib/storage";

const FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "group_name", label: "Group / tagline line", placeholder: "SHAKYAMUNI" },
  { key: "name_en", label: "Shop name (English)", placeholder: "LOKMAN and SONS PVT. LTD." },
  { key: "name_np", label: "Shop name (Nepali)", placeholder: "शाक्यमुनि लोकमान एण्ड सन्स प्रा. लि." },
  { key: "address", label: "Address", placeholder: "Newroad Complex, Shop-2, Kathmandu Nepal" },
  { key: "pan_no", label: "PAN No.", placeholder: "619906627" },
  { key: "reg_no", label: "REG No.", placeholder: "333095/080/081" },
  { key: "phone1", label: "Phone 1" },
  { key: "phone2", label: "Phone 2" },
  { key: "phone3", label: "Phone 3" },
  { key: "email", label: "Email" },
  { key: "facebook", label: "Facebook" },
  { key: "terms_np", label: "Invoice terms line (Nepali)" },
];

export function CompanyProfileCard() {
  const [row, setRow] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("company_profile").select("*").limit(1).maybeSingle();
    setRow(data ?? {});
    const paths = [data?.logo_url, data?.qr_url].filter(Boolean) as string[];
    if (paths.length) setPreviews(await getSignedUrls("product-images", paths));
  }

  function set(key: string, value: any) { setRow((r: any) => ({ ...r, [key]: value })); }

  async function pick(key: "logo_url" | "qr_url", file: File | undefined) {
    if (!file) return;
    try {
      const path = await uploadImage("product-images", file, "company/");
      set(key, path);
      const map = await getSignedUrls("product-images", [path]);
      setPreviews((p) => ({ ...p, ...map }));
      toast.success("Image uploaded — remember to save");
    } catch (e: any) { toast.error(e.message); }
  }

  async function save() {
    if (!row) return;
    setSaving(true);
    const payload: any = { singleton: true };
    FIELDS.forEach((f) => { payload[f.key] = row[f.key] ?? ""; });
    payload.logo_url = row.logo_url ?? null;
    payload.qr_url = row.qr_url ?? null;
    const { error } = row.id
      ? await supabase.from("company_profile").update(payload).eq("id", row.id)
      : await supabase.from("company_profile").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Company profile saved");
    load();
  }

  if (!row) return null;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>Company Profile</CardTitle>
        <p className="text-sm text-muted-foreground">Printed on every invoice, estimate and tag.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              <Input value={row[f.key] ?? ""} placeholder={f.placeholder}
                onChange={(e) => set(f.key, e.target.value)} />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["logo_url", "qr_url"] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label className="text-xs">{k === "logo_url" ? "Logo" : "QR image (optional)"}</Label>
              <div className="flex items-center gap-3">
                {row[k] && previews[row[k]] && (
                  <img src={previews[row[k]]} alt="" className="h-16 w-16 rounded border object-contain" />
                )}
                <Input type="file" accept="image/*" onChange={(e) => pick(k, e.target.files?.[0])} />
              </div>
            </div>
          ))}
        </div>

        <Button onClick={save} disabled={saving}><Save className="mr-1 h-4 w-4" /> Save profile</Button>
      </CardContent>
    </Card>
  );
}
