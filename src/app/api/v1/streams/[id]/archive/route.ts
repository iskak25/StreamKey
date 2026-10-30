import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { closeStream } from "@/lib/server/streams";

export const runtime = "nodejs";

export const POST = route<{ id: string }>({}, async ({ req, params, requestId }) => {
  const acc = await requireAccount(req);
  return ok(await closeStream(acc, params.id, "ARCHIVED", requestId));
});
