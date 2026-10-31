import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { getOrder } from "@/lib/server/orders";

export const runtime = "nodejs";

export const GET = route<{ id: string }>({}, async ({ req, params }) => {
  const acc = await requireAccount(req);
  return ok(await getOrder(acc, params.id));
});
