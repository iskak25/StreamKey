import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { canonicalString, signRequest, verifyRequest } from "@/lib/server/payments/finik-signature";
import { FINIK_WEBHOOK_PATH, parseFinikWebhook } from "@/lib/server/payments/finik";

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const other = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });

describe("finik canonical string", () => {
  it("follows the documented layout: method, path, host + x-api-*, query, body with sorted top-level keys", () => {
    const s = canonicalString({
      method: "POST",
      path: "/v1/payment",
      headers: { Host: "api.example", "x-api-timestamp": "1", "x-api-key": "K", "content-type": "ignored" },
      query: { b: "2", a: "1" },
      body: { Z: 1, Amount: 100 },
    });
    expect(s).toBe(["post", "/v1/payment", "host:api.example&x-api-key:K&x-api-timestamp:1", "a=1&b=2", '{"Amount":100,"Z":1}'].join("\n"));
  });

  it("omits the query line when there is no query and tolerates a lowercase host header", () => {
    const s = canonicalString({ method: "POST", path: "/x", headers: { host: "h", "x-api-key": "K" }, body: { a: 1 } });
    expect(s).toBe(["post", "/x", "host:h&x-api-key:K", '{"a":1}'].join("\n"));
  });
});

describe("finik signature", () => {
  const req = { method: "POST", path: "/v1/payment", headers: { Host: "h", "x-api-key": "K", "x-api-timestamp": "1" }, body: { Amount: 5 } };

  it("verifies with the matching key and rejects tampering or another key", () => {
    const sig = signRequest(req, keys.privateKey);
    expect(verifyRequest(req, keys.publicKey, sig)).toBe(true);
    expect(verifyRequest({ ...req, body: { Amount: 6 } }, keys.publicKey, sig)).toBe(false);
    expect(verifyRequest(req, other.publicKey, sig)).toBe(false);
    expect(verifyRequest(req, keys.publicKey, "not-a-signature")).toBe(false);
  });
});

describe("parseFinikWebhook", () => {
  const origin = "https://shop.example";
  const body = { id: "x_DEBIT", transactionId: "tx-1", status: "SUCCEEDED", amount: 100, fields: { paymentId: "pay-1" } };

  beforeAll(() => {
    process.env.APP_ORIGIN = origin;
  });
  afterEach(() => vi.unstubAllEnvs());

  const signed = (b: Record<string, unknown>, apiHeaders: Record<string, string> = { "x-api-key": "K", "x-api-timestamp": "9" }) => {
    const signature = signRequest({ method: "POST", path: FINIK_WEBHOOK_PATH, headers: { Host: "shop.example", ...apiHeaders }, body: b }, keys.privateKey);
    return { headers: new Headers({ ...apiHeaders, signature }), raw: JSON.stringify(b) };
  };

  it("accepts a correctly signed callback and normalises the status", () => {
    vi.stubEnv("FINIK_WEBHOOK_PUBLIC_KEY", keys.publicKey.replace(/\n/g, "\\n"));
    const { headers, raw } = signed(body);
    expect(parseFinikWebhook(headers, raw)).toEqual({ status: "succeeded", paymentId: "pay-1", transactionId: "tx-1", amount: 100 });
  });

  it("rejects a body changed after signing", () => {
    vi.stubEnv("FINIK_WEBHOOK_PUBLIC_KEY", keys.publicKey);
    const { headers } = signed(body);
    expect(parseFinikWebhook(headers, JSON.stringify({ ...body, amount: 1 }))).toBeNull();
  });

  it("rejects a missing signature, a foreign key, bad JSON and an unconfigured key", () => {
    vi.stubEnv("FINIK_WEBHOOK_PUBLIC_KEY", other.publicKey);
    const { headers, raw } = signed(body);
    expect(parseFinikWebhook(headers, raw)).toBeNull();
    vi.stubEnv("FINIK_WEBHOOK_PUBLIC_KEY", keys.publicKey);
    expect(parseFinikWebhook(new Headers(), raw)).toBeNull();
    expect(parseFinikWebhook(headers, "not json")).toBeNull();
    expect(parseFinikWebhook(headers, "[1]")).toBeNull();
    vi.stubEnv("FINIK_WEBHOOK_PUBLIC_KEY", "");
    expect(parseFinikWebhook(headers, raw)).toBeNull();
  });

  it("does not trust a client-supplied Host header", () => {
    vi.stubEnv("FINIK_WEBHOOK_PUBLIC_KEY", keys.publicKey);
    const { headers, raw } = signed(body);
    headers.set("host", "evil.example");
    expect(parseFinikWebhook(headers, raw)).not.toBeNull();
  });
});
