import { z } from "zod";
import { issueLink } from "@/lib/server/access/issue";
import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

const schema = z
  .object({ label: z.string().trim().max(120).optional(), expiresAt: z.coerce.date(), reason: z.string().trim().min(1).max(500) })
  .strict();

export const POST = route<{ id: string }>({}, async ({ req, params, json, requestId }) => {
  const acc = await requireAccount(req);
  const body = await json(schema);
  const r = await issueLink({
    acc,
    idempotencyKey: req.headers.get("idempotency-key"),
    route: `links/${params.id}/replace`,
    replaceLinkId: params.id,
    label: body.label ?? null,
    expiresAt: body.expiresAt,
    reason: body.reason,
    requestId,
  });
  return ok(r, r.replayed ? 200 : 201);
});
