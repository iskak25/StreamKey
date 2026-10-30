import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const sign = (secret: Buffer, nonce: string): string => createHmac("sha256", secret).update(`csrf:${nonce}`).digest("base64url");

/** Signed double-submit token: `<nonce>.<hmac>`. Stored in a __Host- cookie and echoed in a header. */
export function makeCsrfToken(secret: Buffer): string {
  const nonce = randomBytes(16).toString("base64url");
  return `${nonce}.${sign(secret, nonce)}`;
}

const safeEq = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function verifyCsrf(secret: Buffer, cookie: string | undefined, header: string | null | undefined): boolean {
  if (!cookie || !header || !safeEq(cookie, header)) return false;
  const [nonce, mac, extra] = cookie.split(".");
  if (!nonce || !mac || extra !== undefined) return false;
  return safeEq(mac, sign(secret, nonce));
}
