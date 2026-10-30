import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { parseYoutubeVideoId } from "@/lib/shared/youtube";
import { canAccessStream, canAssignRole, canCreateStreams, canManageUser, type Actor } from "@/lib/shared/roles";
import { computeSessionId, generateToken, isWellFormedToken, linkIdFromToken } from "@/lib/server/crypto/tokens";
import { decryptReceipt, encryptReceipt } from "@/lib/server/crypto/receipt";
import { createStreamSchema } from "@/lib/validation/streams";

const A = (role: Actor["role"], uid = "a", status: Actor["status"] = "ACTIVE"): Actor => ({ uid, role, status });

describe("youtube parser", () => {
  const id = "dQw4w9WgXcQ";
  it.each([
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}&t=1`,
    `https://youtu.be/${id}`,
    `https://youtube.com/live/${id}?si=x`,
  ])("accepts %s", (s) => expect(parseYoutubeVideoId(s)).toBe(id));

  it.each([
    "javascript:alert(1)",
    `https://evil.com/watch?v=${id}`,
    `https://youtube.com.evil.com/watch?v=${id}`,
    "https://youtu.be/short",
    "",
    "http://169.254.169.254/",
  ])("rejects %s", (s) => expect(parseYoutubeVideoId(s)).toBeNull());
});

describe("tokens", () => {
  it("generates 43-char base64url tokens with stable linkId", () => {
    const t = generateToken();
    expect(isWellFormedToken(t)).toBe(true);
    expect(linkIdFromToken(t)).toBe(linkIdFromToken(t));
    expect(linkIdFromToken(t)).not.toBe(t);
  });

  it("sessionId depends on every input and encoding is unambiguous", () => {
    const k = randomBytes(32);
    const base = computeSessionId(k, 1, "ab", "c");
    expect(computeSessionId(k, 1, "a", "bc")).not.toBe(base);
    expect(computeSessionId(k, 2, "ab", "c")).not.toBe(base);
    expect(computeSessionId(randomBytes(32), 1, "ab", "c")).not.toBe(base);
  });
});

describe("receipt", () => {
  const key = randomBytes(32);
  it("round-trips within window, refuses after, and binds AAD", () => {
    const r = encryptReceipt(key, 1, "secret", "u1", "req1");
    const until = new Date(Date.now() + 600_000);
    expect(decryptReceipt(key, r, "u1", "req1", until)).toBe("secret");
    expect(decryptReceipt(key, r, "u1", "req1", until, new Date(until.getTime() + 1))).toBeNull();
    expect(() => decryptReceipt(key, r, "u2", "req1", until)).toThrow();
  });
});

describe("permissions", () => {
  it("admin cannot touch privileged users or self-promote", () => {
    expect(canManageUser(A("ADMIN"), { uid: "x", role: "ADMIN" })).toBe(false);
    expect(canManageUser(A("ADMIN"), { uid: "x", role: "USER" })).toBe(true);
    expect(canAssignRole(A("ADMIN"), { uid: "x", role: "USER" }, "ADMIN")).toBe(false);
    expect(canAssignRole(A("SUPER_ADMIN"), { uid: "a", role: "USER" }, "ADMIN")).toBe(false);
    expect(canAssignRole(A("SUPER_ADMIN"), { uid: "x", role: "USER" }, "ADMIN")).toBe(true);
  });

  it("guest and blocked cannot create streams; owners only access their own", () => {
    expect(canCreateStreams(A("GUEST"), true)).toBe(false);
    expect(canCreateStreams(A("USER", "a", "BLOCKED"), true)).toBe(false);
    expect(canCreateStreams(A("USER"), true)).toBe(true);
    expect(canAccessStream(A("USER"), { ownerUid: "b" })).toBe(false);
    expect(canAccessStream(A("ADMIN"), { ownerUid: "b" })).toBe(true);
  });
});

describe("stream schema", () => {
  const base = { title: "t", youtube: "dQw4w9WgXcQ", accessStartsAt: "2026-11-01T10:00:00Z", accessEndsAt: "2026-11-01T12:00:00Z" };
  it("parses and normalises video id", () => expect(createStreamSchema.parse(base).youtube).toBe("dQw4w9WgXcQ"));
  it("rejects unknown fields, bad window and windows over 7 days", () => {
    expect(createStreamSchema.safeParse({ ...base, ownerUid: "x" }).success).toBe(false);
    expect(createStreamSchema.safeParse({ ...base, accessEndsAt: base.accessStartsAt }).success).toBe(false);
    expect(createStreamSchema.safeParse({ ...base, accessEndsAt: "2026-11-09T10:00:00Z" }).success).toBe(false);
  });
});
