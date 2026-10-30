import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

const b64url = (buf: Buffer): string => buf.toString("base64url");

/** 32 random bytes, base64url without padding. */
export function generateToken(): string {
  return b64url(randomBytes(32));
}

/** linkId = base64url(SHA-256(token)); also the access_links document ID. */
export function linkIdFromToken(token: string): string {
  return b64url(createHash("sha256").update(token, "utf8").digest());
}

export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

const lenPrefixed = (parts: string[]): Buffer =>
  Buffer.concat(
    parts.map((p) => {
      const b = Buffer.from(p, "utf8");
      const len = Buffer.alloc(4);
      len.writeUInt32BE(b.length);
      return Buffer.concat([len, b]);
    }),
  );

/** sessionId = HMAC-SHA256(Ksession, length-prefixed(version, browserSecret, linkId)). */
export function computeSessionId(key: Buffer, version: number, browserSecret: string, linkId: string): string {
  return b64url(createHmac("sha256", key).update(lenPrefixed([String(version), browserSecret, linkId])).digest());
}
