import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedReceipt {
  keyVersion: number;
  nonce: string;
  ciphertext: string;
  tag: string;
}

const aad = (uid: string, requestId: string) => Buffer.from(`${uid}\n${requestId}`, "utf8");

/** AES-256-GCM, unique 96-bit nonce, AAD binds the receipt to uid + request id. */
export function encryptReceipt(key: Buffer, keyVersion: number, plaintext: string, uid: string, requestId: string): EncryptedReceipt {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  c.setAAD(aad(uid, requestId));
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return {
    keyVersion,
    nonce: nonce.toString("base64"),
    ciphertext: ct.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
  };
}

/** Refuses to decrypt after replayUntil even if the document still exists (TTL lag). */
export function decryptReceipt(
  key: Buffer, r: EncryptedReceipt, uid: string, requestId: string, replayUntil: Date, now = new Date(),
): string | null {
  if (now >= replayUntil) return null;
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(r.nonce, "base64"));
  d.setAAD(aad(uid, requestId));
  d.setAuthTag(Buffer.from(r.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(r.ciphertext, "base64")), d.final()]).toString("utf8");
}
