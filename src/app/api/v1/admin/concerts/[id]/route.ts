import { requireAccount } from "@/lib/server/auth/account";
import { getAdminConcert, updateConcert } from "@/lib/server/concerts";
import { ok, route } from "@/lib/server/http";
import { updateConcertSchema } from "@/lib/validation/concerts";

export const runtime = "nodejs";

export const GET = route<{ id: string }>({}, async ({ req, params }) => ok(await getAdminConcert(await requireAccount(req), params.id)));

export const PATCH = route<{ id: string }>({}, async ({ req, params, json, requestId }) => {
  const acc = await requireAccount(req);
  return ok(await updateConcert(acc, params.id, await json(updateConcertSchema), requestId));
});
