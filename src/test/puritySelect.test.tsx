import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PuritySelect } from "@/components/PuritySelect";
import { resetAllowCustomPurityCache } from "@/lib/purity";

/* The purity toggle lives in app_settings; stub the backend read. */
const allowCustom = { value: true };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        limit: () => ({
          maybeSingle: async () => ({ data: { allow_custom_purity: allowCustom.value }, error: null }),
        }),
      }),
    }),
  },
}));

/* Radix Select needs these APIs that jsdom does not implement. */
beforeEach(() => {
  cleanup();
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
  (Element.prototype as any).scrollIntoView = () => {};
});

async function open(toggle: boolean, props: any = {}) {
  allowCustom.value = toggle;
  resetAllowCustomPurityCache();
  const onChange = vi.fn();
  render(<PuritySelect value="22K" onChange={onChange} {...props} />);
  const trigger = screen.getByRole("combobox");
  await waitFor(() => expect(trigger).toBeInTheDocument());
  fireEvent.keyDown(trigger, { key: "Enter" });
  await screen.findByRole("listbox");
  return { onChange };
}

describe("PuritySelect", () => {
  it("lists only the gold categories for gold", async () => {
    await open(true, { metal: "gold" });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining([
      "24K (fine gold)", "22K (916)", "18K (750)", "14K (585)",
    ]));
    expect(options).not.toContain("999 (fine silver)");
    expect(options.some((o) => o?.includes("20K") || o?.includes("9K"))).toBe(false);
  });

  it("lists only the silver categories for silver", async () => {
    await open(true, { metal: "silver" });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(expect.arrayContaining(["999 (fine silver)", "925 (sterling)"]));
    expect(options).not.toContain("22K (916)");
  });

  it("offers custom purity entry when the toggle is on", async () => {
    await open(true, { metal: "gold", allowPercent: true });
    expect(screen.getByText("Custom purity…")).toBeInTheDocument();
    expect(screen.getByText("Purity percentage…")).toBeInTheDocument();
  });

  it("hides custom purity entry when the toggle is off", async () => {
    await open(false, { metal: "gold", allowPercent: true });
    expect(screen.queryByText("Custom purity…")).not.toBeInTheDocument();
    expect(screen.queryByText("Purity percentage…")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Enter custom purity")).not.toBeInTheDocument();
  });

  it("selecting a standard purity reports the raw value, not the label", async () => {
    const { onChange } = await open(true, { metal: "gold" });
    fireEvent.click(screen.getByRole("option", { name: "18K (750)" }));
    expect(onChange).toHaveBeenCalledWith("18K");
  });

  it("keeps an existing non-standard value visible in the list", async () => {
    allowCustom.value = true;
    resetAllowCustomPurityCache();
    render(<PuritySelect value="91.6%" onChange={vi.fn()} metal="gold" />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "Enter" });
    await screen.findByRole("listbox");
    expect(screen.getByRole("option", { name: "91.6%" })).toBeInTheDocument();
  });

  it("commits a typed percentage as a '%' purity", async () => {
    allowCustom.value = true;
    resetAllowCustomPurityCache();
    const onChange = vi.fn();
    render(<PuritySelect value="22K" onChange={onChange} metal="gold" allowPercent />);
    await waitFor(() => expect(screen.getByTitle("Enter custom purity")).toBeInTheDocument());
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    fireEvent.click(await screen.findByText("Purity percentage…"));
    const input = screen.getByPlaceholderText("e.g. 91.6");
    fireEvent.change(input, { target: { value: "91.6" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("91.6%");
  });

  it("commits a typed custom purity uppercased", async () => {
    allowCustom.value = true;
    resetAllowCustomPurityCache();
    const onChange = vi.fn();
    render(<PuritySelect value="22K" onChange={onChange} metal="gold" />);
    await waitFor(() => expect(screen.getByTitle("Enter custom purity")).toBeInTheDocument());
    fireEvent.click(screen.getByTitle("Enter custom purity"));
    const input = screen.getByPlaceholderText("e.g. 21K or 916");
    fireEvent.change(input, { target: { value: "21k" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("21K");
  });
});
