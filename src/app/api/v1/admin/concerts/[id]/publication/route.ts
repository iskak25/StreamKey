import { requireAccount } from "@/lib/server/auth/account";
import { setPublication } from "@/lib/server/concerts";
import { ok, route } from "@/lib/server/http";
import { publicationSchema } from "@/lib/validation/concerts";

export const runtime = "nodejs";

export const POST = route<{ id: string }>({}, async ({ req, params, json, requestId }) => {
  const acc = await requireAccount(req);
  const { status } = await json(publicationSchema);
  return ok(await setPublication(acc, params.id, status, requestId));
});
