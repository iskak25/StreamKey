import { NextResponse } from "next/server";
import { ApiError } from "@/lib/shared/errors";
import { ok, route } from "@/lib/server/http";
import { findOrderByPaymentId, markPaid } from "@/lib/server/orders";
import { parseFinikWebhook } from "@/lib/server/payments/finik";

export const runtime = "nodejs";

const PAID = new Set(["success", "succeeded"]);

/**
 * Finik payment status callback. Delivery is at-least-once and anything but 200 is retried,
 * so everything that is not a transient failure answers 200; the signature is the only authentication.
 */
export const POST = route({ serverToServer: true }, async ({ req, requestId }) => {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 64_000) return NextResponse.json({ error: "too large" }, { status: 413 });

  const hook = parseFinikWebhook(req.headers, raw);
  if (!hook) return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  if (!PAID.has(hook.status) || !hook.paymentId) return ok({ ok: true });

  const found = await findOrderByPaymentId(hook.paymentId);
  if (!found) {
    console.error(JSON.stringify({ requestId, finik: "unknown-payment" }));
    return ok({ ok: true });
  }
  try {
    await markPaid(found.id, hook.transactionId, hook.amount, requestId);
  } catch (e) {
    // Wrong amount: do NOT mark paid and do not make Finik retry forever; needs a manual look.
    if (e instanceof ApiError && e.code === "VALIDATION_ERROR") {
      console.error(JSON.stringify({ requestId, finik: "amount-mismatch", orderId: found.id, expected: found.order.amountKgs, got: hook.amount }));
      return ok({ ok: true });
    }
    throw e;
  }
  return ok({ ok: true });
});
