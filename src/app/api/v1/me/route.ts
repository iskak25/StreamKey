import { requireAccount } from "@/lib/server/auth/account";
import { ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const GET = route({}, async ({ req }) => {
  const { user } = await requireAccount(req);
  return ok({
    uid: user.uid,
    displayName: user.displayName,
    authEmail: user.authEmail,
    role: user.role,
    permissions: user.permissions,
    limits: user.limits,
  });
});
