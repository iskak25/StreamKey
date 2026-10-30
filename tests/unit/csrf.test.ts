import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeCsrfToken, verifyCsrf } from "@/lib/server/csrf";

describe("csrf", () => {
  const secret = randomBytes(32);

  it("accepts a matching signed cookie/header pair", () => {
    const t = makeCsrfToken(secret);
    expect(verifyCsrf(secret, t, t)).toBe(true);
  });

  it("rejects missing, mismatched, forged and wrong-secret tokens", () => {
    const t = makeCsrfToken(secret);
    expect(verifyCsrf(secret, undefined, t)).toBe(false);
    expect(verifyCsrf(secret, t, null)).toBe(false);
    expect(verifyCsrf(secret, t, makeCsrfToken(secret))).toBe(false);
    const forged = `${t.split(".")[0]}.AAAA`;
    expect(verifyCsrf(secret, forged, forged)).toBe(false);
    expect(verifyCsrf(randomBytes(32), t, t)).toBe(false);
    expect(verifyCsrf(secret, `${t}.x`, `${t}.x`)).toBe(false);
  });
});
