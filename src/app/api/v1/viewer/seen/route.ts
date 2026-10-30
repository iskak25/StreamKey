import { z } from "zod";
import { isValidBrowserSecret } from "@/lib/server/access/activate";
import { viewerSeen } from "@/lib/server/access/viewer";
import { ApiError } from "@/lib/shared/errors";
import { COOKIE, ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

const schema = z.object({ linkId: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

export const POST = route({}, async ({ req, json }) => {
  const secret = req.cookies.get(COOKIE.viewer)?.value;
  if (!isValidBrowserSecret(secret)) throw new ApiError("FORBIDDEN", "Доступ не подтверждён");
  const { linkId } = await json(schema);
  await viewerSeen(linkId, secret);
  return ok({});
});
