import { activateLink, isValidBrowserSecret } from "@/lib/server/access/activate";
import { ApiError } from "@/lib/shared/errors";
import { COOKIE, ok, route } from "@/lib/server/http";
import { activateSchema } from "@/lib/validation/streams";

export const runtime = "nodejs";

export const POST = route({}, async ({ req, json, requestId }) => {
  const secret = req.cookies.get(COOKIE.viewer)?.value;
  if (!isValidBrowserSecret(secret)) throw new ApiError("VALIDATION_ERROR", "Браузер не готов: cookies отключены или не подготовлены");
  const { token } = await json(activateSchema);
  const { linkId } = await activateLink(token, secret, requestId);
  return ok({ watchPath: `/watch/${linkId}` });
});
