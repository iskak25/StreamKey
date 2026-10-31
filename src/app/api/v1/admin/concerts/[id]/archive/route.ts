import { requireAccount } from "@/lib/server/auth/account";
import { archiveConcert } from "@/lib/server/concerts";
import { ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const POST = route<{ id: string }>({}, async ({ req, params, requestId }) => ok(await archiveConcert(await requireAccount(req), params.id, requestId)));
