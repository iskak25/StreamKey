import { z } from "zod";
import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { recoverOrder } from "@/lib/server/orders";

export const runtime = "nodejs";

const bodySchema = z.object({ code: z.string().min(8).max(40) }).strict();

export const POST = route({}, async ({ req, json, requestId }) => {
  const acc = await requireAccount(req);
  const { code } = await json(bodySchema);
  return ok(await recoverOrder(acc, code, requestId));
});
