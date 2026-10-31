import { describe, expect, it } from "vitest";
import { bishkekLocalToIso, concertPhase, isoToBishkekLocal } from "@/lib/shared/concerts";
import { createConcertSchema } from "@/lib/validation/concerts";

describe("Bishkek time (UTC+6)", () => {
  it("converts local wall-clock time to UTC and back", () => {
    expect(bishkekLocalToIso("2026-11-01T20:00")).toBe("2026-11-01T14:00:00.000Z");
    expect(bishkekLocalToIso("2026-01-01T03:30")).toBe("2025-12-31T21:30:00.000Z");
    expect(isoToBishkekLocal("2026-11-01T14:00:00.000Z")).toBe("2026-11-01T20:00");
  });
  it("rejects malformed values", () => {
    expect(() => bishkekLocalToIso("01.11.2026 20:00")).toThrow();
  });
});

describe("concertPhase", () => {
  const s = Date.parse("2026-11-01T14:00:00Z");
  const e = Date.parse("2026-11-01T16:00:00Z");
  it("is soon before, live during, ended from the end instant", () => {
    expect(concertPhase(s - 1, s, e)).toBe("soon");
    expect(concertPhase(s, s, e)).toBe("live");
    expect(concertPhase(e - 1, s, e)).toBe("live");
    expect(concertPhase(e, s, e)).toBe("ended");
  });
});

describe("createConcertSchema", () => {
  const ok = { title: "Концерт", description: "", youtube: "https://youtu.be/dQw4w9WgXcQ", priceKgs: 500, startsAt: "2026-11-01T14:00:00Z", endsAt: "2026-11-01T16:00:00Z" };
  it("accepts a valid concert and extracts the video id", () => {
    const r = createConcertSchema.parse(ok);
    expect(r.youtube).toBe("dQw4w9WgXcQ");
    expect(r.priceKgs).toBe(500);
  });
  it("rejects bad price, bad url, reversed or too long window and unknown fields", () => {
    expect(createConcertSchema.safeParse({ ...ok, priceKgs: -1 }).success).toBe(false);
    expect(createConcertSchema.safeParse({ ...ok, priceKgs: 1.5 }).success).toBe(false);
    expect(createConcertSchema.safeParse({ ...ok, priceKgs: 2_000_000 }).success).toBe(false);
    expect(createConcertSchema.safeParse({ ...ok, youtube: "https://evil.com/watch?v=dQw4w9WgXcQ" }).success).toBe(false);
    expect(createConcertSchema.safeParse({ ...ok, endsAt: ok.startsAt }).success).toBe(false);
    expect(createConcertSchema.safeParse({ ...ok, endsAt: "2026-12-01T00:00:00Z" }).success).toBe(false);
    expect(createConcertSchema.safeParse({ ...ok, ownerUid: "x" }).success).toBe(false);
  });
});
