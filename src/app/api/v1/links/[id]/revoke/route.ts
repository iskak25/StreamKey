import { revokeLink, revokeLinkSchema } from "@/lib/server/access/links";
import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const POST = route<{ id: string }>({}, async ({ req, params, json, requestId }) => {
  const acc = await requireAccount(req);
  const { reason } = await json(revokeLinkSchema);
  return ok(await revokeLink(acc, params.id, reason, requestId));
});
