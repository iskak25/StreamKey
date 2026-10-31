import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { startCheckout } from "@/lib/server/orders";

export const runtime = "nodejs";

export const POST = route<{ id: string }>({}, async ({ req, params, requestId }) => {
  const acc = await requireAccount(req);
  return ok(await startCheckout(acc, params.id, requestId));
});
