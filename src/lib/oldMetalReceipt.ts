import { supabase } from "@/integrations/supabase/client";
import { openPrintPreview } from "@/components/PrintPreview";
import { escapeHtml } from "@/lib/html";
import { npr } from "@/lib/format";

/**
 * Standalone old-metal purchase receipt — used when a trade-in is taken as an
 * order advance, so the customer gets a separate purchase document.
 */
export async function printOldMetalReceipt(purchaseId: string, context?: string) {
  const { data: p, error } = await supabase.from("old_gold_purchases").select("*").eq("id", purchaseId).maybeSingle();
  if (error || !p) return;
  const { data: company } = await supabase.from("company_profile").select("name_en, address, pan_no, phone1").maybeSingle();

  const row = (label: string, value: string) =>
    `<tr><td style="padding:3px 8px 3px 0;color:#555">${escapeHtml(label)}</td><td style="padding:3px 0"><strong>${escapeHtml(value)}</strong></td></tr>`;

  openPrintPreview({
    title: `Old Metal Purchase ${p.receipt_number}`,
    fileName: `OldMetal-${p.receipt_number}`,
    page: "a4",
    css: "body{font-family:system-ui,sans-serif;color:#111;font-size:13px} h2{margin:0} table{border-collapse:collapse}",
    html: `
      <div style="text-align:center;border-bottom:1px solid #000;padding-bottom:8px;margin-bottom:12px">
        <h2>${escapeHtml(company?.name_en ?? "Old Metal Purchase")}</h2>
        <div style="font-size:11px">${escapeHtml(company?.address ?? "")} ${company?.phone1 ? "· ☎ " + escapeHtml(company.phone1) : ""}</div>
        <div style="font-size:11px">${company?.pan_no ? "PAN: " + escapeHtml(company.pan_no) : ""}</div>
        <div style="margin-top:6px;font-weight:bold;text-decoration:underline">Old Metal Purchase Receipt</div>
      </div>
      <table>
        ${row("Receipt No", p.receipt_number)}
        ${row("Date", new Date(p.purchased_at).toLocaleString())}
        ${row("Customer", `${p.customer_name}${p.customer_phone ? " · " + p.customer_phone : ""}`)}
        ${context ? row("Applied to", context) : ""}
        ${row("Metal / Purity", `${p.metal} ${p.purity}`)}
        ${row("Gross / Stone / Net wt", `${Number(p.gross_weight).toFixed(3)} / ${Number(p.stone_weight).toFixed(3)} / ${Number(p.net_weight).toFixed(3)} g`)}
        ${row("Fine equivalent", `${Number(p.fine_weight).toFixed(3)} g`)}
        ${row("Rate per gram (fine)", npr(p.rate_per_gram))}
        ${row("Deduction", npr(p.deduction))}
        ${row("Total credited", npr(p.total_amount))}
        ${row("Settlement", String(p.payment_method).replace("_", " "))}
      </table>
      ${p.notes ? `<p style="margin-top:10px;font-size:12px">${escapeHtml(p.notes)}</p>` : ""}
      <div style="display:flex;justify-content:space-between;margin-top:36px;font-size:12px">
        <span>Customer signature</span><span>Authorised signature</span>
      </div>
    `,
  });
}
