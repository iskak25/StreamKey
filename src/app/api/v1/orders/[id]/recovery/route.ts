import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { createRecoveryCode } from "@/lib/server/orders";

export const runtime = "nodejs";

export const POST = route<{ id: string }>({}, async ({ req, params }) => {
  const acc = await requireAccount(req);
  return ok(await createRecoveryCode(acc, params.id));
});
