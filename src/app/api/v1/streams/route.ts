import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { parseLimit } from "@/lib/server/pagination";
import { createStream, listStreams } from "@/lib/server/streams";
import { createStreamSchema } from "@/lib/validation/streams";

export const runtime = "nodejs";

export const GET = route({}, async ({ req }) => {
  const acc = await requireAccount(req);
  const q = req.nextUrl.searchParams;
  return ok(await listStreams(acc, parseLimit(q.get("limit")), q.get("cursor")));
});

export const POST = route({}, async ({ req, json, requestId }) => {
  const acc = await requireAccount(req);
  return ok(await createStream(acc, await json(createStreamSchema), requestId), 201);
});
