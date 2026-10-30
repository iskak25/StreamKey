import { isValidBrowserSecret, newBrowserSecret } from "@/lib/server/access/activate";
import { SETTINGS } from "@/lib/server/config";
import { COOKIE, csrfResponse, ok, route, setCookie } from "@/lib/server/http";

export const runtime = "nodejs";

/** Prepares the browser binding. Never touches any invitation. Keeps an existing valid secret. */
export const POST = route({ csrf: false }, async ({ req }) => {
  const res = csrfResponse();
  if (!isValidBrowserSecret(req.cookies.get(COOKIE.viewer)?.value)) {
    setCookie(res, COOKIE.viewer, newBrowserSecret(), SETTINGS.viewerCookieDays * 86_400);
  }
  return res;
});

/** Confirms the cookie actually comes back to the server before the user spends the invitation. */
export const GET = route({}, async ({ req }) => ok({ cookie: isValidBrowserSecret(req.cookies.get(COOKIE.viewer)?.value) }));
