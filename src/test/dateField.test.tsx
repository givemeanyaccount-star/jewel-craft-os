import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DateField } from "@/components/DateField";
import { setDateMode } from "@/hooks/useDateMode";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("shared date field", () => {
  it("opens a popup and emits a date before closing", () => {
    setDateMode("BS");
    const change = vi.fn();
    render(<DateField value="2026-10-13" max="2026-10-13" onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Nepali date 2083 Ashwin 27" }));
    fireEvent.click(screen.getByRole("button", { name: "2083 Ashwin 20" }));
    expect(change).toHaveBeenCalledWith("2026-10-06");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });
  it("keeps disabled fields closed", () => {
    setDateMode("BS");
    render(<DateField disabled value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pick Nepali date" })).toBeDisabled();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });
});