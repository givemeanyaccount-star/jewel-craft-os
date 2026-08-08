import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberField } from "@/components/ui/number-field";
import { computeInvoiceTaxes, computeLineTotal, computeNetWeight, round2 } from "@/lib/format";
import { useState } from "react";

function Harness({ decimals }: { decimals?: number }) {
  const [v, setV] = useState(0);
  return (
    <>
      <NumberField aria-label="field" value={v} decimals={decimals} onChange={setV} />
      <span data-testid="out">{String(v)}</span>
    </>
  );
}

describe("NumberField", () => {
  it("renders empty instead of a stray 0", () => {
    render(<Harness />);
    expect(screen.getByLabelText("field")).toHaveValue("");
  });

  it("does not prefix typed digits with 0", () => {
    render(<Harness />);
    const input = screen.getByLabelText("field");
    fireEvent.change(input, { target: { value: "25" } });
    expect(input).toHaveValue("25");
    expect(screen.getByTestId("out").textContent).toBe("25");
  });

  it("caps weights at 3 decimals and amounts at 2", () => {
    render(<Harness decimals={3} />);
    const input = screen.getByLabelText("field");
    fireEvent.change(input, { target: { value: "1.23456" } });
    expect(input).toHaveValue("1.234");

    render(<Harness decimals={2} />);
    const money = screen.getAllByLabelText("field")[1];
    fireEvent.change(money, { target: { value: "99.999" } });
    expect(money).toHaveValue("99.99");
  });

  it("clears back to empty, not 0", () => {
    render(<Harness />);
    const input = screen.getByLabelText("field");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(screen.getByTestId("out").textContent).toBe("0");
  });
});

describe("money & weight rounding", () => {
  it("rounds line totals to 2 decimals", () => {
    const r = computeLineTotal({
      netWeight: 3.333, ratePerGram: 10.101, makingCharge: 5, makingChargeType: "per_gram",
      wastageType: "percentage", wastageValue: 2.5, stoneValue: 0.005, quantity: 1,
    });
    expect(r.lineTotal).toBe(round2(r.lineTotal));
    expect(String(r.lineTotal).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("rounds net weight to 3 decimals", () => {
    expect(computeNetWeight(10.0005, 1.0001)).toBe(9);
    expect(computeNetWeight(5.5555, 1.1111)).toBe(4.444);
  });

  it("returns 2-decimal invoice totals", () => {
    const t = computeInvoiceTaxes({ subtotal: 12345.678, stonesTotal: 1234.567, discount: 111.111, oldGoldCredit: 0 });
    for (const v of [t.subtotal, t.vat, t.sdTax, t.total]) {
      expect(String(v).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
    }
  });
});
