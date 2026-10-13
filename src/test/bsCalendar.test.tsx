import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BSCalendar } from "@/components/BSCalendar";
import { bsToAD, adToBSParts } from "@/lib/nepaliDate";

afterEach(cleanup);

describe("BS calendar", () => {
  it("selects a BS day as an AD date without changing the day", () => {
    const select = vi.fn();
    render(<BSCalendar value={bsToAD(2083, 5, 10)} onSelect={select} />);
    fireEvent.click(screen.getByRole("button", { name: "2083 Ashwin 11" }));
    expect(select).toHaveBeenCalledWith(bsToAD(2083, 5, 11));
    expect(adToBSParts(select.mock.calls[0][0])).toEqual({ y: 2083, m: 5, d: 11 });
  });
  it("blocks dates outside the permitted range", () => {
    render(<BSCalendar value={bsToAD(2083, 5, 10)} min={bsToAD(2083, 5, 5)} max={bsToAD(2083, 5, 15)} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "2083 Ashwin 4" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2083 Ashwin 16" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2083 Ashwin 15" })).toBeEnabled();
  });
  it("changes month and year and respects optional clearing", () => {
    const select = vi.fn();
    render(<BSCalendar value={bsToAD(2083, 5, 10)} onSelect={select} />);
    fireEvent.click(screen.getByRole("button", { name: "Next Nepali month" }));
    expect(screen.getByRole("grid", { name: "2083 Kartik" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("BS year"), { target: { value: "2082" } });
    fireEvent.change(screen.getByLabelText("BS month"), { target: { value: "0" } });
    expect(screen.getByRole("grid", { name: "2082 Baisakh" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(select).toHaveBeenCalledWith("");
  });
  it("omits clear for required dates", () => {
    render(<BSCalendar value={bsToAD(2083, 5, 10)} clearable={false} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });
});