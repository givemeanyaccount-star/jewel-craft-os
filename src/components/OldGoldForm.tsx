import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Coins } from "lucide-react";
import { npr, computeNetWeight, computeFineWeight, nextNumber, round2 } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import { uploadImage } from "@/lib/storage";
import { toast } from "sonner";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { CustomerSelector, PickedCustomer } from "@/components/CustomerSelector";
import { PuritySelect } from "@/components/PuritySelect";

const METALS = ["gold", "silver"];

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "esewa", "khalti", "fonepay", "other"];

export interface OldGoldSaveResult { id: string; receiptNumber: string; total: number; metal: string; purity: string; }


/**
 * The single, shared Old Metal Purchase form — used identically whether a purchase
 * happens standalone (Purchases > Old Metal Purchases) or as a trade-in during a sale (POS).
 * ID document + ID photo are mandatory. If the selected customer already has an ID/customer
 * photo on file, those are reused automatically instead of forcing a re-capture.
 */
export function OldGoldForm({
  onSaved, initialCustomer, compact = false, submitLabel = "Record Purchase & Pay Out",
}: {
  onSaved: (result: OldGoldSaveResult) => void;
  initialCustomer?: PickedCustomer | null;
  compact?: boolean;
  submitLabel?: string;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<any>({});
  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer ?? null);
  const [customerRecord, setCustomerRecord] = useState<any>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmNoId, setConfirmNoId] = useState(false);

  useEffect(() => { reset(); }, []);
  function reset() {
    setForm({ metal: "gold", purity: "22K", gross_weight: 0, stone_weight: 0, rate_per_gram: 0, deduction: 0, payment_method: "cash", notes: "" });
    setCustomer(initialCustomer ?? null);
    setIdFile(null);
  }

  // Whenever the picked customer changes, load their full record so we can check
  // for an ID doc already on file and reuse it instead of forcing re-capture.
  useEffect(() => {
    if (!customer) { setCustomerRecord(null); return; }
    supabase.from("customers").select("*").eq("id", customer.id).single().then(({ data }) => setCustomerRecord(data));
  }, [customer?.id]);

  const hasIdOnFile = !!(customerRecord?.id_doc_type && customerRecord?.id_doc_number && customerRecord?.id_doc_image_url);

  const net = computeNetWeight(Number(form.gross_weight || 0), Number(form.stone_weight || 0));
  const fine = computeFineWeight(net, form.purity || "");
  const total = round2(Math.max(0, fine * Number(form.rate_per_gram || 0) - Number(form.deduction || 0)));

  function attemptSave() {
    if (!customer) return toast.error("Select or create a customer first");
    if (!form.gross_weight) return toast.error("Weight required");
    if (!form.rate_per_gram) return toast.error("Rate required");

    const idType = form.id_doc_type || customerRecord?.id_doc_type;
    const idNumber = form.id_doc_number || customerRecord?.id_doc_number;
    const idComplete = hasIdOnFile || (idType && idNumber?.trim() && idFile);
    if (!idComplete) { setConfirmNoId(true); return; }
    save();
  }

  async function save() {
    const idType = form.id_doc_type || customerRecord?.id_doc_type || null;
    const idNumber = form.id_doc_number || customerRecord?.id_doc_number || null;
    setSaving(true);
    try {
      let idPath: string | null = customerRecord?.id_doc_image_url ?? null;
      if (idFile) idPath = await uploadImage("customer-docs", idFile, "oldgold-ids/");

      // Backfill the customer's own record with the ID if they didn't have one yet —
      // so next time (any module) it's already on file and won't need re-capturing.
      const custPatch: any = {};
      if (!hasIdOnFile && (idType || idNumber || idPath)) {
        custPatch.id_doc_type = idType || null; custPatch.id_doc_number = idNumber || null; custPatch.id_doc_image_url = idPath;
      }
      if (Object.keys(custPatch).length) await supabase.from("customers").update(custPatch).eq("id", customer!.id);

      const { data: receipt, error: numErr } = await supabase.rpc("next_document_number", { p_prefix: "OG", p_pad: 5 });
      if (numErr) throw numErr;
      const { data, error } = await supabase.from("old_gold_purchases").insert({
        receipt_number: receipt,
        customer_id: customer!.id, customer_name: customer!.full_name, customer_phone: customer!.phone,
        id_doc_type: idType, id_doc_number: idNumber,
        id_doc_image_url: idPath,
        metal: form.metal, purity: form.purity,
        gross_weight: Number(form.gross_weight), stone_weight: Number(form.stone_weight) || 0,
        net_weight: net, fine_weight: fine,
        rate_per_gram: Number(form.rate_per_gram), deduction: Number(form.deduction) || 0,
        total_amount: total, payment_method: form.payment_method, notes: form.notes || null,
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;
      toast.success(`Receipt ${receipt} created`);
      reset();
      onSaved({ id: data.id, receiptNumber: receipt, total, metal: form.metal, purity: form.purity });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }


  const body = (
    <div className="space-y-4">
      <CustomerSelector value={customer} onChange={setCustomer} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label className="mb-1 block">ID document <span className="text-xs font-normal text-muted-foreground">(recommended)</span></Label>
          {hasIdOnFile ? (
            <div className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs text-muted-foreground">
              On file: {customerRecord.id_doc_type?.replace("_", " ")} {customerRecord.id_doc_number}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Select value={form.id_doc_type} onValueChange={(v) => setForm({ ...form, id_doc_type: v })}>
                  <SelectTrigger><SelectValue placeholder="ID type" /></SelectTrigger>
                  <SelectContent>{["citizenship", "passport", "license", "national_id", "other"].map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="ID number" value={form.id_doc_number ?? ""} onChange={(e) => setForm({ ...form, id_doc_number: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                {idFile && <img src={URL.createObjectURL(idFile)} className="h-12 w-12 rounded object-cover" />}
                <ImageCaptureButton label={idFile ? "Retake ID Photo" : "Capture ID Photo"} title="Add ID Photo" onCapture={setIdFile} />
              </div>
            </div>
          )}
        </div>


        <div><Label>Metal</Label>
          <Select value={form.metal} onValueChange={(v) => setForm({ ...form, metal: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{METALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
          </Select></div>
        <div><Label>Purity</Label>
          <PuritySelect value={form.purity} onChange={(v) => setForm({ ...form, purity: v })}
            metal={form.metal} allowPercent />
        </div>

        <div><Label>Gross wt (g)</Label><NumberField decimals={3} value={form.gross_weight ?? 0} onChange={(v) => setForm({ ...form, gross_weight: v })} /></div>
        <div><Label>Stone wt (g)</Label><NumberField decimals={3} value={form.stone_weight ?? 0} onChange={(v) => setForm({ ...form, stone_weight: v })} /></div>
        <div><Label>Net (auto)</Label><Input readOnly value={net.toFixed(3)} className="bg-muted" /></div>
        <div><Label>Fine (auto)</Label><Input readOnly value={fine.toFixed(3)} className="bg-muted" /></div>
        <div><Label>Rate per gram (fine)</Label><NumberField value={form.rate_per_gram ?? 0} onChange={(v) => setForm({ ...form, rate_per_gram: v })} /></div>
        <div><Label>Deduction</Label><NumberField value={form.deduction ?? 0} onChange={(v) => setForm({ ...form, deduction: v })} /></div>
        <div className="md:col-span-2 rounded bg-secondary p-3 text-center">
          <div className="text-xs text-muted-foreground">Total payable to customer (cash out)</div>
          <div className="text-2xl font-semibold">{npr(total)}</div>
        </div>
        <div><Label>Payment method</Label>
          <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>

      <Button onClick={attemptSave} disabled={saving} className="w-full">{saving ? "Saving..." : submitLabel}</Button>

      <AlertDialog open={confirmNoId} onOpenChange={setConfirmNoId}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Continue without ID information?</AlertDialogTitle>
            <AlertDialogDescription>
              No complete ID document is recorded for this purchase. Capturing customer ID is recommended for gold purchases.
              You can add the ID details later from Purchases → Old Metal Purchases.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => save()}>Continue without ID</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );


  if (compact) return body;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2"><Coins className="h-5 w-5" /> <span className="font-medium">New Old Metal Purchase</span></div>
        {body}
      </CardContent>
    </Card>
  );
}
