import "server-only";
import { ApiError } from "@/lib/shared/errors";
import { appOrigin } from "../config";
import { signRequest, verifyRequest } from "./finik-signature";
import type { PaymentRequest, PaymentSession } from "./provider";

const HOSTS = { prod: "api.acquiring.averspay.kg", beta: "beta.api.acquiring.averspay.kg" } as const;
const PAYMENT_PATH = "/v1/payment";
export const FINIK_WEBHOOK_PATH = "/api/v1/payments/finik/webhook";

/** PEM values in env files and Vercel are stored with literal \n sequences. */
const pem = (v: string) => v.replace(/\\n/g, "\n").trim();

function config() {
  const env = process.env.FINIK_ENV === "prod" ? "prod" : process.env.FINIK_ENV === "beta" ? "beta" : null;
  const apiKey = process.env.FINIK_API_KEY;
  const privateKey = process.env.FINIK_PRIVATE_PEM;
  const accountId = process.env.FINIK_ACCOUNT_ID;
  if (!env || !apiKey || !privateKey || !accountId) throw new ApiError("TEMPORARY_UNAVAILABLE", "Оплата через Finik не настроена");
  return { host: HOSTS[env], apiKey, privateKey: pem(privateKey), accountId, qrName: process.env.FINIK_QR_NAME || "StreamKey" };
}

/** POST /v1/payment: Finik answers 302 and the payment page is in the Location header. */
export async function createFinikPayment(req: PaymentRequest): Promise<PaymentSession> {
  const c = config();
  const body = {
    Amount: req.amountKgs,
    CardType: "FINIK_QR",
    PaymentId: req.paymentId,
    RedirectUrl: req.returnUrl,
    Lang: "ru",
    Data: {
      accountId: c.accountId,
      name_en: c.qrName,
      webhookUrl: `${appOrigin()}${FINIK_WEBHOOK_PATH}`,
      description: req.description.slice(0, 120),
    },
  };
  const timestamp = Date.now().toString();
  const signature = signRequest(
    { method: "POST", path: PAYMENT_PATH, headers: { Host: c.host, "x-api-key": c.apiKey, "x-api-timestamp": timestamp }, body },
    c.privateKey,
  );

  let res: Response;
  try {
    res = await fetch(`https://${c.host}${PAYMENT_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": c.apiKey, "x-api-timestamp": timestamp, signature },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError("TEMPORARY_UNAVAILABLE", "Платёжный сервис не отвечает");
  }

  const location = res.headers.get("location");
  if (res.status === 302 && location) {
    let url: URL;
    try {
      url = new URL(location);
    } catch {
      throw new ApiError("TEMPORARY_UNAVAILABLE", "Платёжный сервис вернул неверный ответ");
    }
    if (url.protocol !== "https:") throw new ApiError("TEMPORARY_UNAVAILABLE", "Платёжный сервис вернул неверный ответ");
    return { url: url.toString(), providerRef: req.paymentId };
  }
  // Only the status and the provider error text are logged: never keys, signatures or the request body.
  const detail = (await res.text().catch(() => "")).slice(0, 200);
  console.error(JSON.stringify({ finik: "create-payment-failed", status: res.status, detail }));
  throw new ApiError("TEMPORARY_UNAVAILABLE", "Не удалось создать платёж, попробуйте позже");
}

export interface FinikWebhook {
  status: string;
  paymentId: string | null;
  transactionId: string | null;
  amount: number;
}

/**
 * Checks the callback signature with Finik public key and extracts what we need.
 * The host is our configured origin (not the client-supplied Host header) because that is what Finik signed.
 * Returns null for anything that does not verify.
 */
export function parseFinikWebhook(headers: Headers, rawBody: string): FinikWebhook | null {
  const publicKey = process.env.FINIK_WEBHOOK_PUBLIC_KEY;
  const signature = headers.get("signature");
  if (!publicKey || !signature) return null;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    body = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const signedHeaders: Record<string, string> = { Host: new URL(appOrigin()).host };
  headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith("x-api-")) signedHeaders[name.toLowerCase()] = value;
  });
  if (!verifyRequest({ method: "POST", path: FINIK_WEBHOOK_PATH, headers: signedHeaders, body }, pem(publicKey), signature)) return null;

  const fields = typeof body.fields === "object" && body.fields !== null ? (body.fields as Record<string, unknown>) : {};
  return {
    status: String(body.status ?? "").toLowerCase(),
    paymentId: typeof fields.paymentId === "string" ? fields.paymentId : null,
    transactionId: typeof body.transactionId === "string" ? body.transactionId : null,
    amount: Number(body.amount),
  };
}
