import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedUrls } from "@/lib/storage";
import { toBS, toADDate, toADDateTime, toNepaliDigits } from "@/lib/nepaliDate";
import { amountInWords } from "@/lib/numberToWords";
import { computeLineTotal, computeNetWeight, round2 } from "@/lib/format";
import { useCompanyProfile, TOLA_IN_GRAMS } from "@/components/PrintDocument";
import logoAsset from "@/assets/logo.png";

const n2 = (v: number) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n3 = (v: number) => Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", bank_transfer: "Bank Transfer", esewa: "eSewa",
  khalti: "Khalti", fonepay: "QR Scan / Fonepay", credit: "Credit",
  old_gold: "Old Metal Trade-in", other: "Other",
};

export function orderRowMath(r: any) {
  const qty = Math.max(1, Number(r.quantity ?? 1));
  const grossWt = Number(r.expected_gross_weight ?? 0);
  const stoneWt = Number(r.expected_stone_weight ?? 0);
  const netWt = Number(r.expected_net_weight ?? computeNetWeight(grossWt, stoneWt));
  const rate = Number(r.rate ?? 0);
  const { making, wastageAmount } = computeLineTotal({
    netWeight: netWt, ratePerGram: rate,
    makingCharge: Number(r.making_input ?? 0), makingChargeType: (r.making_type ?? "per_gram") as any,
    wastageType: (r.wastage_type ?? "percentage") as any, wastageValue: Number(r.wastage_input ?? 0),
    stoneValue: Number(r.stone_value ?? 0), quantity: qty,
  });
  const wastageWt = rate > 0 ? wastageAmount / rate : 0;
  const totalWt = netWt + wastageWt;
  const metalAmt = totalWt * rate;
  const stoneAmt = Number(r.stone_value ?? 0);
  const rowTotal = round2((metalAmt + stoneAmt + making) * qty);
  return { qty, grossWt, stoneWt, netWt, rate, wastageWt, totalWt, metalAmt, stoneAmt, making, rowTotal };
}

type Props = {
  /** "order" prints the full order confirmation, "advance" prints just the advance receipt. */
  mode: "order" | "advance";
  order: any;
  items: any[];
  advances?: any[];
  cashierName?: string;
  domId: string;
};

/**
 * Order confirmation / advance receipt, built to match the sales invoice layout
 * (same header, billing block, bordered table, totals band, terms and signatures).
 */
export function OrderPrintDocument({ mode, order, items, advances = [], cashierName, domId }: Props) {
  const profile = useCompanyProfile();
  const [logo, setLogo] = useState<string>(logoAsset);
  const [qr, setQr] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [tolaRate, setTolaRate] = useState<number | null>(null);

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
      const paths = items.flatMap((i: any) => (i.photos ?? []).slice(0, 1)).slice(0, 4);
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

  const cust = order?.customers;
  const live = items.filter((i: any) => i.status !== "cancelled");
  const estimate = round2(live.reduce((a: number, i: any) => a + orderRowMath(i).rowTotal, 0));
  const cashAdvance = round2(advances.filter((p) => p.method !== "old_gold").reduce((a, p) => a + Number(p.amount ?? 0), 0));
  const metalAdvance = round2(advances.filter((p) => p.method === "old_gold").reduce((a, p) => a + Number(p.amount ?? 0), 0));
  const advanceTotal = round2(cashAdvance + metalAdvance);
  const balance = round2(Math.max(0, estimate - advanceTotal));

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

  const title = mode === "order" ? "Order Confirmation" : "Advance Receipt";

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
            <div style={{ fontSize: "12px", fontWeight: "bold", textDecoration: "underline", marginTop: "3px" }}>{title}</div>
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
            <div><b>Customer</b> : {cust?.full_name ?? "—"}</div>
            <div><b>Address</b> &nbsp;&nbsp;: {[cust?.address, cust?.city].filter(Boolean).join(", ") || "—"}</div>
            <div><b>Contact No</b> : {cust?.phone ?? "—"}</div>
          </div>
          <div style={{ width: "30%", padding: "5px 10px" }}>
            <div><b>Order Date</b> : {order?.order_date ? toADDate(order.order_date) : "—"}</div>
            <div><b>Order Miti</b> &nbsp;: {order?.order_date ? toBS(order.order_date) : "—"}</div>
            <div><b>Promised</b> &nbsp;&nbsp;: {order?.promised_date ? toADDate(order.promised_date) : "—"}</div>
          </div>
          <div style={{ flex: 1, padding: "5px 10px" }}>
            <div><b>Order No</b> : {order?.order_no}</div>
            <div><b>Printed</b> &nbsp;&nbsp;: {toADDateTime(new Date().toISOString())}</div>
            <div><b>Status</b> &nbsp;&nbsp;&nbsp;: {order?.status}</div>
          </div>
        </div>

        {/* ITEMS (order mode) */}
        {mode === "order" && (
          <table className="pd-items" style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", borderTop: "1.5px solid #000" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: "26px" }}>SN</th>
                <th style={th}>Item / Description</th>
                <th style={{ ...th, width: "44px" }}>Type</th>
                <th style={{ ...th, width: "34px" }}>Qty</th>
                <th style={{ ...th, width: "62px" }}>Exp. Gross<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
                <th style={{ ...th, width: "60px" }}>Less/St. Wt<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
                <th style={{ ...th, width: "58px" }}>Net Wt<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
                <th style={{ ...th, width: "56px" }}>Waste<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
                <th style={{ ...th, width: "62px" }}>Total Wt<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
                <th style={{ ...th, width: "64px" }}>Rate<br /><span style={{ fontWeight: 400, fontSize: "8px" }}>(gm)</span></th>
                <th style={{ ...th, width: "78px" }}>Metal Amt</th>
                <th style={{ ...th, width: "66px" }}>Stone Amt</th>
                <th style={{ ...th, width: "64px" }}>Making</th>
                <th style={{ ...th, width: "80px" }}>Estimated<br />Amount</th>
              </tr>
            </thead>
            <tbody>
              {live.map((r: any, i: number) => {
                const m = orderRowMath(r);
                return (
                  <tr key={r.id ?? i}>
                    <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                    <td style={cell}>
                      {r.description}
                      {r.notes && <div style={{ fontSize: "8px", color: "#555" }}>{r.notes}</div>}
                      {r.karigar_name && <div style={{ fontSize: "8px", color: "#777" }}>Karigar: {r.karigar_name}</div>}
                    </td>
                    <td style={{ ...cell, textAlign: "center", textTransform: "capitalize" }}>{r.metal}<br />{r.purity}</td>
                    <td style={{ ...cell, textAlign: "center" }}>{m.qty}</td>
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
                    <td style={rr}>{n2(m.metalAmt)}</td>
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
                  <td key={i} style={{ height: "0px", borderLeft: bd, borderRight: bd, borderBottom: "1.5px solid #000" }}></td>
                ))}
              </tr>
            </tbody>
          </table>
        )}

        {/* FOOTER BAND */}
        <div className="pd-keep pd-tail" style={{ display: "table", width: "100%", tableLayout: "fixed", fontSize: "10px", borderTop: mode === "advance" ? "1.5px solid #000" : undefined }}>
          <div style={{ display: "table-cell", verticalAlign: "top", padding: "6px 10px", borderRight: bd }}>
            <div><b>In Words:</b> {amountInWords(mode === "order" ? estimate : advanceTotal)}</div>
            {thumbs.length > 0 && (
              <div style={{ display: "flex", gap: "6px", margin: "8px 0 6px" }}>
                {thumbs.map((src, i) => (
                  <img key={i} src={src} alt="" style={{ width: "50px", height: "50px", objectFit: "cover", border: "1px solid #999" }} />
                ))}
              </div>
            )}
            <div style={{ marginTop: "10px" }}><b>Remarks:</b> {order?.notes ?? ""}</div>
          </div>

          <div style={{ display: "table-cell", verticalAlign: "top", width: "250px", borderRight: "1.5px solid #000" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
              <tbody>
                <tr><th colSpan={3} style={{ border: bd, padding: "3px", textAlign: "center" }}>Advance Received</th></tr>
                {advances.length === 0 && (
                  <tr><td style={{ border: bd, padding: "3px 6px" }} colSpan={3}>—</td></tr>
                )}
                {advances.map((p, i) => (
                  <tr key={p.id ?? i}>
                    <td style={{ border: bd, padding: "3px 6px" }}>{toADDate(p.paid_at)}</td>
                    <td style={{ border: bd, padding: "3px 6px" }}>
                      {PAYMENT_LABEL[p.method] ?? p.method}
                      {p.reference && <div style={{ fontSize: "8px", color: "#777" }}>{p.reference}</div>}
                    </td>
                    <td style={{ border: bd, padding: "3px 6px", textAlign: "right" }}>{n2(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "table-cell", verticalAlign: "top", width: "260px" }}>
            {tot("Estimated Amount", n2(estimate), { fontWeight: "bold", fontSize: "13px", borderBottom: bd })}
            {tot("Advance (cash / bank)", n2(cashAdvance))}
            {tot("Advance (old metal)", n2(metalAdvance))}
            {tot("Total Advance", n2(advanceTotal), { borderTop: bd, borderBottom: bd })}
            {tot("Estimated Balance", n2(balance), { fontWeight: "bold", fontSize: "13px", borderBottom: bd })}
          </div>
        </div>

        {/* TERMS + SIGNATURES */}
        <div className="pd-keep pd-tail">
          <div style={{ textAlign: "center", fontSize: "10px", padding: "6px", borderTop: "1.5px solid #000" }}>
            This is a provisional order estimate, not a tax invoice. The final price is confirmed on delivery
            using the actual finished weight and the agreed rate basis. {profile.terms_np}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", padding: "16px 14px 4px" }}>
            <span>Received by: <b>{cashierName ?? ""}</b></span>
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
