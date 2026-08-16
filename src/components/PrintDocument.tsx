import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/storage";
import { toBS, toADDate, toADDateTime, toNepaliDigits } from "@/lib/nepaliDate";
import { amountInWords } from "@/lib/numberToWords";
import { fetchLatestFineRates, billFineRate, fineEquivalentNote, type FineRates } from "@/lib/fineEquivalent";
import { advanceReceivedFromPayments, netPayableOf } from "@/lib/format";

import logoAsset from "@/assets/logo.png";
import { openPrintPreview } from "@/components/PrintPreview";


export const TOLA_IN_GRAMS = 11.664;

export type CompanyProfile = {
  group_name: string; name_en: string; name_np: string; address: string;
  pan_no: string; reg_no: string; phone1: string; phone2: string; phone3: string;
  email: string; facebook: string; logo_url: string | null; qr_url: string | null; terms_np: string;
};

const FALLBACK_PROFILE: CompanyProfile = {
  group_name: "", name_en: "JewelMaster", name_np: "", address: "Kathmandu, Nepal",
  pan_no: "", reg_no: "", phone1: "", phone2: "", phone3: "", email: "", facebook: "",
  logo_url: null, qr_url: null,
  terms_np: "यस बिल बमोजिमका सामानमा, बिलको पछाडि उल्लेख गरिएका नियम र सर्तहरु लागु हुनेछ।",
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", bank_transfer: "Bank Transfer", esewa: "eSewa",
  khalti: "Khalti", fonepay: "QR Scan / Fonepay", credit: "Credit",
  old_gold: "Old Metal", other: "Other",
};

const n2 = (v: number) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n3 = (v: number) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function docRowMath(r: any) {
  const netWt = Number(r.weight ?? 0);
  const rate = Number(r.rate ?? 0);
  const wastageWt = r.wastage_type === "weight"
    ? Number(r.wastage_input ?? 0)
    : (rate > 0 ? Number(r.wastage_amount ?? 0) / rate : 0);
  const totalWt = netWt + wastageWt;
  const goldAmt = totalWt * rate;
  const stoneAmt = Number(r.stone_value ?? 0);
  const making = Number(r.making_charge ?? 0);
  const qty = Number(r.quantity ?? 1);
  const grossWt = Number(r.gross_weight ?? netWt + Number(r.stone_weight ?? 0));
  const stoneWt = Number(r.stone_weight ?? 0);
  const rowTotal = (goldAmt + stoneAmt + making) * qty;
  return { netWt, rate, wastageWt, totalWt, goldAmt, stoneAmt, making, qty, grossWt, stoneWt, rowTotal };
}

/** Opens a print preview for the element with the given DOM id. */
export function printDocument(domId: string, title = "Document", fileName?: string) {
  const el = document.getElementById(domId);
  if (!el) return;
  openPrintPreview({
    title,
    fileName: fileName ?? title,
    page: "a4-landscape",
    marginMm: 6,
    html: el.innerHTML,
  });
}


export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile>(FALLBACK_PROFILE);
  useEffect(() => {
    supabase.from("company_profile").select("*").limit(1).maybeSingle().then(({ data }) => {
      if (data) setProfile({ ...FALLBACK_PROFILE, ...(data as any) });
    });
  }, []);
  return profile;
}

type Props = {
  kind: "invoice" | "estimate";
  doc: any;
  items: any[];
  payments?: any[];
  cashierName?: string;
  domId: string;
};

export function PrintDocument({ kind, doc, items, payments = [], cashierName, domId }: Props) {
  const profile = useCompanyProfile();
  const [logo, setLogo] = useState<string>(logoAsset);
  const [qr, setQr] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [tolaRate, setTolaRate] = useState<number | null>(null);
  const [fineRates, setFineRates] = useState<FineRates>({});
  const [tradeMetal, setTradeMetal] = useState<string>("gold");


  useEffect(() => {
    (async () => {
      const paths = [profile.logo_url, profile.qr_url].filter(Boolean) as string[];
      if (!paths.length) return;
      const map = await getSignedUrls("product-images", paths);
      if (profile.logo_url && map[profile.logo_url]) setLogo(map[profile.logo_url]);
      if (profile.qr_url && map[profile.qr_url]) setQr(map[profile.qr_url]);
    })();
  }, [profile.logo_url, profile.qr_url]);

  useEffect(() => {
    (async () => {
      const ids = items.map((i) => i.inventory_item_id).filter(Boolean);
      if (!ids.length) return setThumbs([]);
      const { data } = await supabase.from("inventory_items").select("image_urls").in("id", ids);
      const paths = (data ?? []).flatMap((r: any) => (r.image_urls ?? []).slice(0, 1)).slice(0, 4);
      if (!paths.length) return setThumbs([]);
      const map = await getSignedUrls("product-images", paths);
      setThumbs(paths.map((p: string) => map[p]).filter(Boolean));
    })();
  }, [items]);

  useEffect(() => {
    supabase.from("metal_rates").select("rate_per_gram, purity")
      .eq("metal", "gold").order("effective_date", { ascending: false }).limit(12)
      .then(({ data }) => {
        const fine = (data ?? []).find((r: any) => /24|fine/i.test(r.purity ?? ""));
        const row = fine ?? (data ?? [])[0];
        if (row) setTolaRate(Number(row.rate_per_gram) * TOLA_IN_GRAMS);
      });
  }, []);

  // Latest fine (pure) rate per metal, used for the trade-in equivalent weight.
  useEffect(() => { fetchLatestFineRates().then(setFineRates); }, []);

  // Which metal was traded in (the linked old metal/metal purchase); defaults to gold.
  useEffect(() => {
    if (kind !== "invoice" || !doc?.id) return;
    supabase.from("old_gold_purchases").select("metal, total_amount")
      .eq("linked_invoice_id", doc.id).order("total_amount", { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]?.metal) setTradeMetal(data[0].metal as string); });
  }, [kind, doc?.id]);

  const isInvoice = kind === "invoice";
  const cust = doc.customers;
  const docNo = isInvoice ? doc.invoice_number : doc.quote_number;
  const docDate = doc.issued_at ?? doc.created_at;

  const gross = items.reduce((s, r) => s + docRowMath(r).rowTotal, 0);
  const discount = Number(doc.discount ?? 0);
  const stones = Number(doc.stones_total ?? 0);
  const oldGold = Number(doc.old_gold_credit ?? 0);
  const afterDiscount = gross - discount;
  const sdRate = Number(doc.sd_tax_rate ?? 0);
  const sdTax = Number(doc.sd_tax ?? 0);
  const sdTaxable = Math.max(0, afterDiscount - stones - oldGold);
  const vat = Number(doc.vat_amount ?? 0);
  const netTotal = Number(doc.total ?? 0);
  // Cash-type advances collected on the linked order and settled against this bill.
  const advanceReceived = advanceReceivedFromPayments(payments as any);
  const netPayable = netPayableOf(netTotal, advanceReceived);
  // At-sale payment modes (advance rows excluded — they print as their own line).
  const modeRows = (() => {
    const m = new Map<string, number>();
    for (const p of payments as any[]) {
      if (p?.order_id && p?.method !== "old_gold") continue; // counted as advance
      const key = String(p?.method ?? "other");
      m.set(key, (m.get(key) ?? 0) + (Number(p?.amount ?? 0) || 0));
    }
    return Array.from(m.entries()).filter(([, v]) => v !== 0);
  })();
  const atSaleTotal = modeRows.reduce((s, [, v]) => s + v, 0);
  const totalReceived = oldGold + advanceReceived + atSaleTotal;
  const balanceDue = Math.max(0, doc.balance_due != null
    ? Number(doc.balance_due)
    : netPayable - atSaleTotal);



  const oldGoldEq = oldGold > 0
    ? fineEquivalentNote(oldGold, billFineRate(items, tradeMetal, fineRates), tradeMetal)
    : null;


  const bd = "1px solid #000";
  const cell: React.CSSProperties = { borderLeft: bd, borderRight: bd, padding: "4px 3px", verticalAlign: "top" };
  const th: React.CSSProperties = { border: bd, padding: "3px 2px", fontSize: "9px", lineHeight: 1.15 };
  const rr: React.CSSProperties = { ...cell, textAlign: "right" };
  const tot = (label: string, value: string, style: React.CSSProperties = {}) => (
    <div style={{ display: "table", width: "100%", tableLayout: "fixed", padding: "3px 8px", fontSize: "11px", boxSizing: "border-box", ...style }}>
      <span style={{ display: "table-cell" }}>{label}</span>
      <span style={{ display: "table-cell", textAlign: "right" }}>{value}</span>
    </div>
  );

  return (
    <div id={domId} style={{ display: "none" }}>
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#000", border: "1.5px solid #000" }}>

        {/* HEADER */}
        <div className="pd-keep" style={{ display: "flex", padding: "8px 10px", gap: "10px", alignItems: "flex-start" }}>
          <div style={{ width: "240px", fontSize: "11px", fontWeight: "bold", lineHeight: 2 }}>
            <div>
              PAN No:{" "}
              {(profile.pan_no || "").split("").map((c, i) => (
                <span key={i} style={{ display: "inline-block", border: bd, width: "15px", textAlign: "center", fontFamily: "monospace" }}>{c}</span>
              ))}
            </div>
            {profile.reg_no && <div>REG No: {profile.reg_no}</div>}
          </div>

          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
              <img src={logo} alt="" style={{ height: "62px", objectFit: "contain" }} />
              <div>
                {profile.group_name && <div style={{ fontSize: "10px", fontWeight: "bold", letterSpacing: "1px" }}>{profile.group_name}</div>}
                <div style={{ fontSize: "19px", fontWeight: "bold" }}>{profile.name_en}</div>
                {profile.name_np && <div style={{ fontSize: "13px", fontWeight: "bold" }}>{profile.name_np}</div>}
                {profile.address && <div style={{ fontSize: "10px", fontWeight: "bold", marginTop: "2px" }}>{profile.address}</div>}
              </div>
            </div>
            <div style={{ fontSize: "12px", fontWeight: "bold", textDecoration: "underline", marginTop: "3px" }}>
              {isInvoice ? "Tax Invoice" : "Estimate"}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            {qr && <img src={qr} alt="" style={{ width: "60px", height: "60px", objectFit: "contain" }} />}
            <div style={{ border: bd, fontSize: "10px", padding: "2px 6px", lineHeight: 1.85 }}>
              <div>☎ {[profile.phone1, profile.phone2, profile.phone3].filter(Boolean).join(", ") || "—"}</div>
              {profile.email && <div>✉ {profile.email}</div>}
              {profile.facebook && <div>● {profile.facebook}</div>}
            </div>
          </div>
        </div>

        {/* BILLING */}
        <div style={{ display: "flex", borderTop: "1.5px solid #000", fontSize: "11px" }}>
          <div style={{ width: "38%", padding: "5px 10px" }}>
            <div><b>Customer</b> : {cust?.full_name ?? (isInvoice ? "Walk-in" : "Prospect")}</div>
            <div><b>Address</b> &nbsp;&nbsp;: {[cust?.address, cust?.city].filter(Boolean).join(", ") || "—"}</div>
            <div><b>Contact No</b> : {cust?.phone ?? "—"}</div>
          </div>
          <div style={{ width: "30%", padding: "5px 10px" }}>
            <div><b>Pan No.</b> &nbsp;&nbsp;: {cust?.id_doc_number ?? "n/a"}</div>
            <div><b>Order Date</b> : {doc.created_at ? toADDate(doc.created_at) : ""}</div>
            <div><b>Tran. Date</b> : {toADDate(docDate)} ({toBS(docDate)})</div>
          </div>
          <div style={{ flex: 1, padding: "5px 10px" }}>
            <div><b>{isInvoice ? "Invoice No" : "Estimate No"}</b> : {docNo}</div>
            <div><b>{isInvoice ? "Invoice Date" : "Estimate Date"}</b> : {toADDateTime(docDate)}</div>
            <div><b>Bill Miti</b> &nbsp;&nbsp;&nbsp;: {toBS(docDate)}</div>
          </div>
        </div>

        {/* ITEMS */}
        <table className="pd-items" style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", borderTop: "1.5px solid #000" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: "26px" }}>SN</th>
              <th style={{ ...th, width: "42px" }}>HS<br />Code</th>
              <th style={th}>Item</th>
              <th style={{ ...th, width: "44px" }}>Type</th>
              <th style={{ ...th, width: "62px" }}>Gross Wt<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
              <th style={{ ...th, width: "66px" }}>Less/St. Wt<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
              <th style={{ ...th, width: "58px" }}>Net Wt<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
              <th style={{ ...th, width: "56px" }}>Waste<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
              <th style={{ ...th, width: "62px" }}>Total Wt<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
              <th style={{ ...th, width: "64px" }}>Rate<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
              <th style={{ ...th, width: "78px" }}>Amount</th>
              <th style={{ ...th, width: "70px" }}>Stone Amt</th>
              <th style={{ ...th, width: "68px" }}>Making</th>
              <th style={{ ...th, width: "80px" }}>Total<br />Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => {
              const m = docRowMath(r);
              return (
                <tr key={r.id ?? i}>
                  <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                  <td style={cell}></td>
                  <td style={cell}>
                    {r.description}{m.qty > 1 ? ` ×${m.qty}` : ""}
                  </td>
                  <td style={{ ...cell, textAlign: "center", textTransform: "capitalize" }}>
                    {r.metal ?? ""}<br />{r.purity ?? ""}
                  </td>
                  <td style={rr}>{n3(m.grossWt)}</td>
                  <td style={rr}>{n2(m.stoneWt)}</td>
                  <td style={rr}>{n3(m.netWt)}</td>
                  <td style={rr}>
                    {n3(m.wastageWt)}
                    {r.wastage_type === "percentage" && Number(r.wastage_input) > 0 && (
                      <div style={{ fontSize: "7.5px", color: "#666" }}>({r.wastage_input}%)</div>
                    )}
                  </td>
                  <td style={rr}>{n3(m.totalWt)}</td>
                  <td style={rr}>{n3(m.rate)}</td>
                  <td style={rr}>{n2(m.goldAmt)}</td>
                  <td style={rr}>{m.stoneAmt ? n2(m.stoneAmt) : ""}</td>
                  <td style={rr}>
                    {m.making ? n2(m.making) : ""}
                    {r.making_type === "percentage" && Number(r.making_input) > 0 && (
                      <div style={{ fontSize: "7.5px", color: "#666" }}>({r.making_input}%)</div>
                    )}
                    {r.making_type === "per_gram" && Number(r.making_input) > 0 && (
                      <div style={{ fontSize: "7.5px", color: "#666" }}>({r.making_input}/g)</div>
                    )}
                  </td>
                  <td style={{ ...rr, fontWeight: 600 }}>{n2(m.rowTotal)}</td>
                </tr>
              );
            })}
            <tr className="pd-filler">
              {Array.from({ length: 14 }).map((_, i) => (
                <td
                  key={i}
                  style={{
                    height: "0px",
                    borderLeft: bd,
                    borderRight: bd,
                    borderBottom: "1.5px solid #000",
                  }}
                ></td>
              ))}
            </tr>

          </tbody>
        </table>

        {/* FOOTER BAND */}
        <div className="pd-keep pd-tail" style={{ display: "table", width: "100%", tableLayout: "fixed", fontSize: "10px" }}>
          <div style={{ display: "table-cell", verticalAlign: "top", padding: "6px 10px", borderRight: bd }}>
            <div><b>In Words:</b> {amountInWords(netTotal)}</div>
            {thumbs.length > 0 && (
              <div style={{ display: "flex", gap: "6px", margin: "8px 0 6px" }}>
                {thumbs.map((src, i) => (
                  <img key={i} src={src} alt="" style={{ width: "50px", height: "50px", objectFit: "cover", border: "1px solid #999" }} />
                ))}
              </div>
            )}
            <div style={{ marginTop: "10px" }}><b>Remarks:</b> {doc.notes ?? ""}</div>
          </div>

          {isInvoice && (
            <div style={{ display: "table-cell", verticalAlign: "top", width: "230px", borderRight: "1.5px solid #000" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <tbody>
                  <tr><th colSpan={2} style={{ border: bd, padding: "3px", textAlign: "center" }}>Payment Mode</th></tr>
                  {oldGold > 0 && (
                    <tr>
                      <td style={{ border: bd, padding: "3px 6px" }}>Old Metal</td>
                      <td style={{ border: bd, padding: "3px 6px", textAlign: "right" }}>
                        {n2(oldGold)}
                        {oldGoldEq && <div style={{ fontSize: "8px", color: "#777" }}>{oldGoldEq}</div>}
                      </td>
                    </tr>
                  )}
                  {advanceReceived > 0 && (
                    <tr>
                      <td style={{ border: bd, padding: "3px 6px" }}>Advance (order)</td>
                      <td style={{ border: bd, padding: "3px 6px", textAlign: "right" }}>{n2(advanceReceived)}</td>
                    </tr>
                  )}
                  {modeRows.map(([method, amt]) => (
                    <tr key={method}>
                      <td style={{ border: bd, padding: "3px 6px" }}>{PAYMENT_LABEL[method] ?? method}</td>
                      <td style={{ border: bd, padding: "3px 6px", textAlign: "right" }}>{n2(amt)}</td>
                    </tr>
                  ))}
                  {totalReceived === 0 && (
                    <tr><td style={{ border: bd, padding: "3px 6px" }} colSpan={2}>—</td></tr>
                  )}
                  <tr>
                    <td style={{ border: bd, padding: "3px 6px", fontWeight: "bold" }}>Total Received</td>
                    <td style={{ border: bd, padding: "3px 6px", textAlign: "right", fontWeight: "bold" }}>{n2(totalReceived)}</td>
                  </tr>
                  {balanceDue > 0 && (
                    <tr>
                      <td style={{ border: bd, padding: "3px 6px", fontWeight: "bold" }}>Balance Due</td>
                      <td style={{ border: bd, padding: "3px 6px", textAlign: "right", fontWeight: "bold" }}>{n2(balanceDue)}</td>
                    </tr>
                  )}

                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: "table-cell", verticalAlign: "top", width: "260px" }}>
            {tot("Amount", n2(gross), { fontWeight: "bold", fontSize: "13px" })}
            {tot("Discount", n2(discount))}
            {tot("Total", n2(afterDiscount), { borderBottom: bd })}
            {tot("Non Taxable Amt", n2(stones))}
            {tot("Customer Old Metal", n2(oldGold))}
            {oldGoldEq && (
              <div style={{ padding: "0 8px 3px", fontSize: "8.5px", color: "#777", textAlign: "right" }}>{oldGoldEq}</div>
            )}

            {vat > 0 && tot(`VAT ${doc.vat_rate}% (stones)`, n2(vat))}
            {tot("SD Taxable Amt", n2(sdTaxable))}
            {tot(`SD Tax (${sdRate}%)`, n2(sdTax))}
            {tot("Net Total", n2(netTotal), { fontWeight: "bold", fontSize: "13px", borderTop: bd, borderBottom: bd })}
            {advanceReceived > 0 && tot("Less: Advance Paid", n2(advanceReceived))}
            {tot("Net Payable", n2(netPayable), { fontWeight: "bold", fontSize: "13px", borderBottom: bd })}

          </div>
        </div>

        {/* TERMS + SIGNATURES */}
        <div className="pd-keep pd-tail">
        <div style={{ textAlign: "center", fontSize: "10px", padding: "6px", borderTop: "1.5px solid #000" }}>
          {isInvoice
            ? profile.terms_np
            : "This estimate is based on today's metal rates and is valid until the date stated above."}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "16px 14px 4px" }}>
          <span>Cashier: <b>{cashierName ?? ""}</b></span>
          <span>Customer:</span>
          <span>{profile.name_en}:</span>
        </div>
        <div style={{ fontSize: "8.5px", color: "#777", padding: "4px 14px 6px" }}>
          ({toNepaliDigits(1)} तोला = {toNepaliDigits(TOLA_IN_GRAMS.toFixed(3))} ग्राम)
          {tolaRate ? ` · 24 क्यारेट 1 तोला सुनको मुल्य: ${Math.round(tolaRate).toLocaleString("en-IN")}` : ""}
        </div>
        </div>
      </div>
    </div>
  );
}
