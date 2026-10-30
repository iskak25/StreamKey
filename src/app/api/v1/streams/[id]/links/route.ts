import { issueLink } from "@/lib/server/access/issue";
import { listLinks } from "@/lib/server/access/links";
import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";
import { parseLimit } from "@/lib/server/pagination";
import { createLinkSchema } from "@/lib/validation/streams";

export const runtime = "nodejs";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params }) => {
  const acc = await requireAccount(req);
  const q = req.nextUrl.searchParams;
  return ok(await listLinks(acc, params.id, parseLimit(q.get("limit")), q.get("cursor")));
});

export const POST = route<P>({}, async ({ req, params, json, requestId }) => {
  const acc = await requireAccount(req);
  const body = await json(createLinkSchema);
  const r = await issueLink({
    acc,
    idempotencyKey: req.headers.get("idempotency-key"),
    route: `streams/${params.id}/links`,
    streamId: params.id,
    label: body.label ?? null,
    expiresAt: body.expiresAt,
    requestId,
  });
  return ok(r, r.replayed ? 200 : 201);
});
