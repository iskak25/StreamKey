import "server-only";
import { createSign, createVerify } from "node:crypto";

export interface SignedRequest {
  method: string;
  /** Absolute path only, no query string. */
  path: string;
  /** `host` plus every `x-api-*` header; names are matched case-insensitively. */
  headers: Record<string, string | undefined>;
  query?: Record<string, string | undefined> | null;
  body?: Record<string, unknown> | null;
}

const header = (headers: SignedRequest["headers"], name: string): string | undefined => {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
};

/**
 * Canonical string of the Finik request signature scheme (documented at
 * finik.kg/documentation/web-sdk): method, path, host and x-api-* headers, sorted query, body with sorted top-level keys.
 */
export function canonicalString(r: SignedRequest): string {
  const host = header(r.headers, "host");
  if (!host) throw new Error("host header is required");
  const apiHeaders = Object.keys(r.headers)
    .filter((k) => k.toLowerCase().startsWith("x-api-"))
    .sort()
    .map((k) => {
      const v = r.headers[k];
      if (v === undefined) throw new Error("invalid x-api header");
      return `${k.toLowerCase()}:${v}`;
    });
  const headersPart = [`host:${host}`, ...apiHeaders].join("&");

  const q = r.query ?? {};
  const queryPart = Object.keys(q)
    .sort()
    .map((k) => `${encodeURI(decodeURI(k))}=${encodeURI(decodeURI(q[k] ?? ""))}`)
    .join("&");

  let bodyPart = "";
  if (r.body) {
    const sorted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r.body).sort((a, b) => a[0].localeCompare(b[0]))) sorted[k] = v;
    bodyPart = JSON.stringify(sorted);
  }
  return [r.method.toLowerCase(), decodeURI(r.path), headersPart, ...(queryPart ? [queryPart] : []), bodyPart].join("\n");
}

/** RSA-SHA256, base64: goes into the `signature` header. */
export function signRequest(r: SignedRequest, privateKeyPem: string): string {
  return createSign("SHA256").update(canonicalString(r)).sign(privateKeyPem, "base64");
}

export function verifyRequest(r: SignedRequest, publicKeyPem: string, signature: string): boolean {
  try {
    return createVerify("SHA256").update(canonicalString(r)).verify(publicKeyPem, signature, "base64");
  } catch {
    return false;
  }
}
