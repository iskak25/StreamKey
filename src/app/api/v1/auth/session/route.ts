import { z } from "zod";
import { createAccountSession } from "@/lib/server/auth/account";
import { SETTINGS } from "@/lib/server/config";
import { clearCookie, COOKIE, ok, route, setCookie } from "@/lib/server/http";

export const runtime = "nodejs";

const bodySchema = z.object({ idToken: z.string().min(20).max(8192) }).strict();

export const POST = route({}, async ({ json, requestId }) => {
  const { idToken } = await json(bodySchema);
  const { cookie, user } = await createAccountSession(idToken, requestId);
  const res = ok({ uid: user.uid, role: user.role });
  setCookie(res, COOKIE.account, cookie, SETTINGS.accountSessionDays * 86_400);
  return res;
});

export const DELETE = route({}, async () => {
  const res = ok({});
  clearCookie(res, COOKIE.account);
  return res;
});
