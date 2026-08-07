import { npr } from "@/lib/format";

export interface CreditNoteLine {
  description: string;
  purity?: string | null;
  qty: number;
  original: number;   // pre-tax item price
  discount: number;   // pro-rata discount deducted
  net: number;        // net refund price
}

export interface CreditNoteData {
  number: string;
  at: string;                 // ISO
  invoiceNumber: string;
  invoiceDate: string;        // ISO
  customerName: string;
  customerPhone?: string | null;
  company?: { name_en?: string; address?: string; phone1?: string; pan_no?: string } | null;
  lines: CreditNoteLine[];
  gross: number;
  discount: number;
  taxRetained: number;
  total: number;
  method: string;
  reason?: string;
}

export function creditNoteNumber(seq?: number) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const tail = seq ?? Math.floor(Math.random() * 9000 + 1000);
  return `CN-${ymd}-${String(tail).padStart(4, "0")}`;
}

/** Print-ready credit note. Rendered on screen and reused verbatim for printing. */
export function CreditNote({ data }: { data: CreditNoteData }) {
  const co = data.company;
  return (
    <div className="credit-note mx-auto w-full max-w-3xl bg-card p-8 text-card-foreground">
      <header className="border-b pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{co?.name_en || "Credit Note"}</h1>
            {co?.address && <p className="text-sm text-muted-foreground">{co.address}</p>}
            {(co?.phone1 || co?.pan_no) && (
              <p className="text-xs text-muted-foreground">
                {co?.phone1 ? `Tel: ${co.phone1}` : ""}{co?.phone1 && co?.pan_no ? " · " : ""}{co?.pan_no ? `PAN: ${co.pan_no}` : ""}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Credit Note</div>
            <div className="text-lg font-semibold">{data.number}</div>
            <div className="text-xs text-muted-foreground">{new Date(data.at).toLocaleString()}</div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 border-b py-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Customer</div>
          <div className="font-medium">{data.customerName}</div>
          {data.customerPhone && <div className="text-muted-foreground">{data.customerPhone}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Against invoice</div>
          <div className="font-medium">{data.invoiceNumber}</div>
          <div className="text-muted-foreground">dated {new Date(data.invoiceDate).toLocaleDateString()}</div>
        </div>
      </section>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Item</th>
            <th className="py-2 pr-2 text-right">Original price</th>
            <th className="py-2 pr-2 text-right">Discount applied</th>
            <th className="py-2 pr-2 text-right">Net refund price</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i} className="border-b align-top">
              <td className="py-2 pr-2">{i + 1}</td>
              <td className="py-2 pr-2">
                {l.description}
                {l.purity && <span className="text-xs text-muted-foreground"> · {l.purity}</span>}
              </td>
              <td className="py-2 pr-2 text-right">{npr(l.original)}</td>
              <td className="py-2 pr-2 text-right">− {npr(l.discount)}</td>
              <td className="py-2 pr-2 text-right">{npr(l.net)}</td>
              <td className="py-2 pr-2 text-right">{l.qty}</td>
              <td className="py-2 text-right">{npr(l.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-4 flex justify-end">
        <div className="w-full max-w-sm space-y-1 text-sm">
          <Row label="Gross return value" value={npr(data.gross)} />
          <Row label="Pro-rata discount deducted" value={`− ${npr(data.discount)}`} />
          <Row label="Tax Retained (Non-Refundable)" value={npr(data.taxRetained)} muted />
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total refund due</span><span>{npr(data.total)}</span>
          </div>
          <div className="pt-1 text-xs capitalize text-muted-foreground">Refund method: {data.method.replace("_", " ")}</div>
        </div>
      </section>

      {data.reason && (
        <p className="mt-4 text-xs text-muted-foreground">Reason: {data.reason}</p>
      )}
      <p className="mt-6 border-t pt-3 text-[11px] text-muted-foreground">
        Taxes charged on the original invoice are non-refundable and have been retained. This credit note is a
        computer-generated document valid without signature.
      </p>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
