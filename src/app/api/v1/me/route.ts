import { requireAccount } from "@/lib/server/auth/account";
import { db } from "@/lib/server/firebase-admin";
import { ok, route } from "@/lib/server/http";
import { COLLECTIONS } from "@/lib/server/schema";

export const runtime = "nodejs";

export const GET = route({}, async ({ req }) => {
  const { user } = await requireAccount(req);
  const usage = (await db.collection(COLLECTIONS.usage).doc(user.uid).get()).data() as
    | { activeStreams?: number; issuedLifetime?: number }
    | undefined;
  return ok({
    usage: { activeStreams: usage?.activeStreams ?? 0, issuedLifetime: usage?.issuedLifetime ?? 0 },
    uid: user.uid,
    displayName: user.displayName,
    authEmail: user.authEmail,
    role: user.role,
    permissions: user.permissions,
    limits: user.limits,
  });
});
