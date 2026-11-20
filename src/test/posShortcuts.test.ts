import { describe, it, expect } from "vitest";
import { posShortcutFor, isDialogOpen } from "@/hooks/usePosShortcuts";

describe("POS shortcuts", () => {
  it("F2 focuses search", () => expect(posShortcutFor("F2")).toBe("search"));
  it("F4 holds the bill", () => expect(posShortcutFor("F4")).toBe("hold"));
  it("F8 completes the sale", () => expect(posShortcutFor("F8")).toBe("checkout"));
  it("other keys do nothing", () => expect(posShortcutFor("F5")).toBeNull());
  it("pauses while a popup is open", () => {
    expect(isDialogOpen()).toBe(false);
    const d = document.createElement("div"); d.setAttribute("role", "dialog");
    document.body.appendChild(d);
    expect(isDialogOpen()).toBe(true);
    d.remove();
  });
});
