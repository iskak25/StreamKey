import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, errorBody } from "@/lib/shared/errors";
import { appOrigin, csrfSecret, demoMode, SETTINGS } from "./config";
import { makeCsrfToken, verifyCsrf } from "./csrf";

export const COOKIE = { account: "__Host-account", viewer: "__Host-viewer", csrf: "__Host-csrf" } as const;

export interface Ctx<P extends Record<string, string>> {
  req: NextRequest;
  requestId: string;
  params: P;
  json<T>(schema: ZodType<T>): Promise<T>;
}

export const ok = (body: unknown, status = 200): NextResponse => NextResponse.json(body, { status });

export function setCookie(res: NextResponse, name: string, value: string, maxAgeSeconds: number, httpOnly = true): void {
  res.cookies.set(name, value, { httpOnly, secure: true, sameSite: "lax", path: "/", maxAge: maxAgeSeconds });
}

export function clearCookie(res: NextResponse, name: string): void {
  res.cookies.set(name, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** Fresh signed CSRF token: HttpOnly cookie + the same value in the body for the page to echo in a header. */
export function csrfResponse(extra: Record<string, unknown> = {}): NextResponse {
  const token = makeCsrfToken(csrfSecret());
  const res = ok({ ...extra, csrfToken: token });
  setCookie(res, COOKIE.csrf, token, 60 * 60 * 12);
  return res;
}

function assertSameOrigin(req: NextRequest): void {
  const allowed = [appOrigin()];
  // Demo mode without APP_ORIGIN: trust the host this very request was served on (never a client-chosen one:
  // Origin must still equal it exactly).
  if (demoMode && !process.env.APP_ORIGIN) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    if (host) allowed.push(`${proto}://${host}`);
  }
  const origin = req.headers.get("origin");
  if (!origin || !allowed.includes(origin)) throw new ApiError("FORBIDDEN", "Недопустимый источник запроса");
}

function assertCsrf(req: NextRequest): void {
  if (!verifyCsrf(csrfSecret(), req.cookies.get(COOKIE.csrf)?.value, req.headers.get("x-csrf-token"))) {
    throw new ApiError("FORBIDDEN", "Недействительный CSRF-токен");
  }
}

export interface RouteOptions {
  /** Require a valid CSRF token on mutating requests (default true). */
  csrf?: boolean;
  /** Signed server-to-server callback (payment webhook): no browser Origin or CSRF; the handler MUST verify a signature itself. */
  serverToServer?: boolean;
}

/**
 * Wraps a route handler: request id, exact Origin check and CSRF for mutating methods,
 * bounded JSON body, uniform error envelope. Nothing from internal errors is leaked.
 */
export function route<P extends Record<string, string> = Record<string, never>>(
  opts: RouteOptions,
  fn: (ctx: Ctx<P>) => Promise<NextResponse>,
) {
  return async (req: NextRequest, rc: { params: Promise<P> }): Promise<NextResponse> => {
    const requestId = randomUUID();
    try {
      if (req.method !== "GET" && req.method !== "HEAD" && !opts.serverToServer) {
        assertSameOrigin(req);
        if (opts.csrf !== false) assertCsrf(req);
      }
      const params = await rc.params;
      const res = await fn({
        req,
        requestId,
        params,
        async json(schema) {
          const text = await req.text();
          if (Buffer.byteLength(text) > SETTINGS.maxBodyBytes) throw new ApiError("VALIDATION_ERROR", "Слишком большое тело запроса");
          let raw: unknown;
          try {
            raw = JSON.parse(text);
          } catch {
            throw new ApiError("VALIDATION_ERROR", "Некорректный JSON");
          }
          return schema.parse(raw);
        },
      });
      res.headers.set("x-request-id", requestId);
      res.headers.set("Cache-Control", "private, no-store");
      return res;
    } catch (err) {
      return toErrorResponse(err, requestId);
    }
  };
}

function toErrorResponse(err: unknown, requestId: string): NextResponse {
  let apiErr: ApiError;
  if (err instanceof ApiError) apiErr = err;
  else if (err instanceof ZodError) apiErr = new ApiError("VALIDATION_ERROR", "Некорректные данные запроса");
  else {
    // Log only the error class: messages may carry document contents or secrets.
    console.error(JSON.stringify({ requestId, unhandled: err instanceof Error ? err.name : typeof err }));
    apiErr = new ApiError("TEMPORARY_UNAVAILABLE", "Временная ошибка, повторите запрос");
  }
  const res = NextResponse.json(errorBody(apiErr, requestId), { status: apiErr.status, headers: apiErr.headers });
  res.headers.set("x-request-id", requestId);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
