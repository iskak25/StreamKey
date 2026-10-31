import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/shared/next-path";

describe("safeNext", () => {
  it("allows only our concert and order pages", () => {
    expect(safeNext("/concerts/abc123")).toBe("/concerts/abc123");
    expect(safeNext("/concerts/abc123?buy=1")).toBe("/concerts/abc123?buy=1");
    expect(safeNext("/orders/abc_def")).toBe("/orders/abc_def");
  });
  it("rejects external and malformed targets", () => {
    for (const v of ["https://evil.example", "//evil.example", "/dashboard", "/concerts/../admin", "/concerts/a?x=1", "javascript:alert(1)", "", undefined, null, ["/concerts/a"]]) {
      expect(safeNext(v as never)).toBeNull();
    }
  });
});
