import { supabase } from "@/integrations/supabase/client";

export interface SimilarCustomer {
  id: string;
  full_name: string;
  phone: string | null;
}

/** Live "similar name" lookup — informational only, doesn't block anything. */
export async function findSimilarCustomers(name: string, excludeId?: string): Promise<SimilarCustomer[]> {
  const q = name.trim();
  if (q.length < 2) return [];
  let query = supabase.from("customers").select("id, full_name, phone").ilike("full_name", `%${q}%`).limit(5);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return data ?? [];
}

export interface DuplicateCheckResult {
  blocked: boolean;
  reason?: string;
  existing?: { id: string; full_name: string };
}

/**
 * Hard-blocking check: same phone number, or same (id_doc_type + id_doc_number),
 * already belongs to a different customer.
 */
export async function checkCustomerDuplicate(params: {
  phone?: string | null;
  id_doc_type?: string | null;
  id_doc_number?: string | null;
  excludeId?: string;
}): Promise<DuplicateCheckResult> {
  const { phone, id_doc_type, id_doc_number, excludeId } = params;

  if (phone?.trim()) {
    let q = supabase.from("customers").select("id, full_name").eq("phone", phone.trim()).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    if (data && data.length > 0) {
      return { blocked: true, reason: `Phone number already belongs to "${data[0].full_name}"`, existing: data[0] };
    }
  }

  if (id_doc_type && id_doc_number?.trim()) {
    let q = supabase.from("customers").select("id, full_name")
      .eq("id_doc_type", id_doc_type as any).eq("id_doc_number", id_doc_number.trim()).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q;
    if (data && data.length > 0) {
      return { blocked: true, reason: `This ID document already belongs to "${data[0].full_name}"`, existing: data[0] };
    }
  }

  return { blocked: false };
}
