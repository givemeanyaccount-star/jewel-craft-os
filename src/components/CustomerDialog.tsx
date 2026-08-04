import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { uploadImage } from "@/lib/storage";
import { ImageCaptureButton } from "@/components/ImageCapture";
import { findSimilarCustomers, checkCustomerDuplicate, SimilarCustomer, DuplicateCheckResult } from "@/lib/customerDuplicates";

export const ID_TYPES = ["citizenship", "passport", "license", "national_id", "other"];

/**
 * The single, shared "add / edit customer" dialog used everywhere a customer record
 * is created or edited (Customers page, Old Gold Purchase, Repairs, etc). Keeping this
 * in one place means duplicate-checking and photo capture behave identically everywhere.
 */
export function CustomerDialog({
  open, onOpenChange, editing, onSaved, prefillName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing?: any;
  onSaved: (customer: any) => void;
  prefillName?: string;
}) {
  const [form, setForm] = useState<any>({});
  const [idFile, setIdFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [similar, setSimilar] = useState<SimilarCustomer[]>([]);
  const [phoneWarning, setPhoneWarning] = useState<DuplicateCheckResult | null>(null);
  const [idWarning, setIdWarning] = useState<DuplicateCheckResult | null>(null);

  useEffect(() => {
    setForm(editing ?? { full_name: prefillName ?? "", phone: "", email: "", address: "", city: "Kathmandu", credit_limit: 0 });
    setIdFile(null);
    setPhotoFile(null);
    setSimilar([]);
    setPhoneWarning(null);
    setIdWarning(null);
  }, [editing, open, prefillName]);

  async function onNameChange(name: string) {
    setForm({ ...form, full_name: name });
    setSimilar(await findSimilarCustomers(name, editing?.id));
  }

  async function onPhoneBlur() {
    if (!form.phone?.trim()) return setPhoneWarning(null);
    const res = await checkCustomerDuplicate({ phone: form.phone, excludeId: editing?.id });
    setPhoneWarning(res.blocked ? res : null);
  }

  async function onIdBlur() {
    if (!form.id_doc_number?.trim() || !form.id_doc_type) return setIdWarning(null);
    const res = await checkCustomerDuplicate({ id_doc_type: form.id_doc_type, id_doc_number: form.id_doc_number, excludeId: editing?.id });
    setIdWarning(res.blocked ? res : null);
  }

  async function save() {
    if (!form.full_name?.trim()) return toast.error("Full name required");

    const dup = await checkCustomerDuplicate({
      phone: form.phone, id_doc_type: form.id_doc_type, id_doc_number: form.id_doc_number, excludeId: editing?.id,
    });
    if (dup.blocked) return toast.error(dup.reason);

    setSaving(true);
    try {
      let docPath = form.id_doc_image_url ?? null;
      if (idFile) docPath = await uploadImage("customer-docs", idFile, "ids/");
      let photoPath = form.photo_url ?? null;
      if (photoFile) photoPath = await uploadImage("customer-docs", photoFile, "customer-photos/");
      const payload: any = {
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        id_doc_type: form.id_doc_type || null,
        id_doc_number: form.id_doc_number || null,
        id_doc_image_url: docPath,
        photo_url: photoPath,
        notes: form.notes || null,
        credit_limit: Number(form.credit_limit) || 0,
      };
      let saved: any;
      if (editing) {
        const { data, error } = await supabase.from("customers").update(payload).eq("id", editing.id).select().single();
        if (error) throw error; saved = data; toast.success("Customer updated");
      } else {
        const { data, error } = await supabase.from("customers").insert(payload).select().single();
        if (error) throw error; saved = data; toast.success("Customer created");
      }
      onSaved(saved);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit Customer" : "New Customer"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Full name</Label>
            <Input value={form.full_name ?? ""} onChange={(e) => onNameChange(e.target.value)} />
            {similar.length > 0 && (
              <div className="mt-1.5 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Similar names already exist:</div>
                <ul className="space-y-0.5">
                  {similar.map((s) => <li key={s.id}>· {s.full_name} {s.phone && `(${s.phone})`}</li>)}
                </ul>
              </div>
            )}
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneWarning(null); }} onBlur={onPhoneBlur} />
            {phoneWarning && <Warning text={phoneWarning.reason!} />}
          </div>
          <div><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label>City</Label><Input value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>Credit limit (रू)</Label><Input type="number" value={form.credit_limit ?? 0} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Address</Label><Textarea rows={2} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>ID document type</Label>
            <Select value={form.id_doc_type ?? undefined} onValueChange={(v) => { setForm({ ...form, id_doc_type: v }); setIdWarning(null); }}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{ID_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select></div>
          <div>
            <Label>ID number</Label>
            <Input value={form.id_doc_number ?? ""} onChange={(e) => { setForm({ ...form, id_doc_number: e.target.value }); setIdWarning(null); }} onBlur={onIdBlur} />
            {idWarning && <Warning text={idWarning.reason!} />}
          </div>
          <div>
            <Label className="mb-1 block">ID photo</Label>
            <PhotoField file={idFile} existingUrl={form.id_doc_image_url} onCapture={setIdFile} title="Add ID Photo" />
          </div>
          <div>
            <Label className="mb-1 block">Customer photo</Label>
            <PhotoField file={photoFile} existingUrl={form.photo_url} onCapture={setPhotoFile} title="Add Customer Photo" />
          </div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !!phoneWarning || !!idWarning}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <div className="mt-1 flex items-start gap-1 text-xs text-destructive">
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{text}</span>
    </div>
  );
}

function PhotoField({ file, existingUrl, onCapture, title }: { file: File | null; existingUrl?: string | null; onCapture: (f: File) => void; title: string }) {
  const preview = file ? URL.createObjectURL(file) : null;
  return (
    <div className="flex items-center gap-2">
      {preview ? <img src={preview} className="h-12 w-12 rounded object-cover" /> : existingUrl ? (
        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">On file</div>
      ) : null}
      <ImageCaptureButton label={file || existingUrl ? "Retake" : "Capture"} onCapture={onCapture} title={title} />
    </div>
  );
}
