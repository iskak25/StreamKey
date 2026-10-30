import { requireAccount } from "@/lib/server/auth/account";
import { adminAuth, demoMode } from "@/lib/server/firebase-admin";
import { clearCookie, COOKIE, ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const POST = route({}, async ({ req }) => {
  const acc = await requireAccount(req);
  if (!demoMode) await adminAuth.revokeRefreshTokens(acc.actor.uid);
  const res = ok({});
  clearCookie(res, COOKIE.account);
  return res;
});
