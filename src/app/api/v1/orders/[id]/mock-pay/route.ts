import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { completeMockPayment } from "@/lib/server/orders";

export const runtime = "nodejs";

/** Test provider only (PAYMENTS_PROVIDER=mock); 404 otherwise. */
export const POST = route<{ id: string }>({}, async ({ req, params, requestId }) => {
  const acc = await requireAccount(req);
  await completeMockPayment(acc, params.id, requestId);
  return ok({ ok: true });
});
