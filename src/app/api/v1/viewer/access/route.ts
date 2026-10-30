import { isValidBrowserSecret } from "@/lib/server/access/activate";
import { viewerAccess } from "@/lib/server/access/viewer";
import { ApiError } from "@/lib/shared/errors";
import { COOKIE, ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

export const GET = route({}, async ({ req }) => {
  const secret = req.cookies.get(COOKIE.viewer)?.value;
  const linkId = req.nextUrl.searchParams.get("linkId") ?? "";
  if (!isValidBrowserSecret(secret) || !/^[A-Za-z0-9_-]{43}$/.test(linkId)) throw new ApiError("FORBIDDEN", "Доступ не подтверждён");
  return ok(await viewerAccess(linkId, secret));
});
