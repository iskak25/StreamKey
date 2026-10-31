import { requireAccount } from "@/lib/server/auth/account";
import { createConcert, listAdminConcerts } from "@/lib/server/concerts";
import { ok, route } from "@/lib/server/http";
import { createConcertSchema } from "@/lib/validation/concerts";

export const runtime = "nodejs";

export const GET = route({}, async ({ req }) => ok({ items: await listAdminConcerts(await requireAccount(req)) }));

export const POST = route({}, async ({ req, json, requestId }) => {
  const acc = await requireAccount(req);
  return ok(await createConcert(acc, await json(createConcertSchema), requestId), 201);
});
