import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { getOwnedStream, streamDto, updateStream, updateStreamSchema } from "@/lib/server/streams";

export const runtime = "nodejs";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params }) => {
  const acc = await requireAccount(req);
  return ok(streamDto(params.id, await getOwnedStream(acc, params.id)));
});

export const PATCH = route<P>({}, async ({ req, params, json, requestId }) => {
  const acc = await requireAccount(req);
  return ok(await updateStream(acc, params.id, await json(updateStreamSchema), requestId));
});
