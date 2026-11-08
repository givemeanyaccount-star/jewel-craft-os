import { beforeEach, describe, expect, it } from "vitest";
import { readPrintDiagnostics, recordPrintDiagnostic } from "@/lib/printDiagnostics";

describe("bill print diagnostics", () => {
  beforeEach(() => localStorage.clear());
  it("retains failures for the related bill only", () => {
    recordPrintDiagnostic("SALE-1", "image", "Item 2 photo failed");
    recordPrintDiagnostic("SALE-2", "print", "Print unavailable");
    expect(readPrintDiagnostics("SALE-1")).toEqual([expect.objectContaining({ bill: "SALE-1", kind: "image", detail: "Item 2 photo failed", time: expect.any(String) })]);
  });
  it("does not retain signed image addresses", () => {
    recordPrintDiagnostic("SALE-1", "image", "Failed https://example.com/photo?token=secret");
    expect(readPrintDiagnostics("SALE-1")[0].detail).toBe("Failed [image address]");
  });
});