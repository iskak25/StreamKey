import { NextResponse, type NextRequest } from "next/server";

/**
 * Pre-routing only: sets a per-request CSP nonce (spec 14.1). Authorization stays in the
 * route handlers and the data layer, never here.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  // Google sign-in needs its own origins, but only on the login page.
  const isLogin = request.nextUrl.pathname === "/login";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const authFrames = isLogin ? ["https://accounts.google.com", ...(authDomain ? [`https://${authDomain}`] : [])] : [];
  const authConnect = isLogin
    ? ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://www.googleapis.com"]
    : [];
  // Guests buy without Google: an anonymous Firebase session needs only the token endpoints, no frames or scripts.
  const guestAuth = request.nextUrl.pathname.startsWith("/concerts/") || request.nextUrl.pathname === "/recover";
  const guestConnect = guestAuth && !isLogin ? ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"] : [];
  const authScripts = isLogin ? ["https://apis.google.com"] : [];
  // Google's sign-in helper injects an inline style (reported by the browser with this exact hash). Allowed by hash, not by
  // 'unsafe-inline', and style ATTRIBUTES (its hidden iframe) are allowed on the login page only.
  const loginStyleHash = "'sha256-zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk='";

  const csp = [
    "default-src 'self'",
    // Official IFrame API only; 'strict-dynamic' lets our nonced script load its helpers.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.youtube.com ${authScripts.join(" ")}${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${isLogin ? ` ${loginStyleHash}` : ""}`,
    ...(isLogin ? ["style-src-attr 'unsafe-inline'"] : []),
    "img-src 'self' data: https://i.ytimg.com https://*.googleusercontent.com",
    `frame-src https://www.youtube.com https://www.youtube-nocookie.com ${authFrames.join(" ")}`,
    `connect-src 'self' ${authConnect.join(" ")} ${guestConnect.join(" ")}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
    .map((d) => d.replace(/\s+/g, " ").trim())
    .join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!api|_next/static|_next/image|favicon.ico).*)", missing: [{ type: "header", key: "next-router-prefetch" }] }],
};
