import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostics for the Vercel 500 (removed after). Reports import errors and which env vars are SET (booleans only).
export async function GET() {
  const names = ["DEMO_MODE", "APP_ORIGIN", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "CSRF_SECRET", "SESSION_HMAC_KEY_V1", "RECEIPT_AES_KEY_V1", "NEXT_PUBLIC_FIREBASE_API_KEY"];
  const out: Record<string, string> = { node: process.version };
  for (const n of names) out[n] = n === "DEMO_MODE" || n === "APP_ORIGIN" ? String(process.env[n]) : String(Boolean(process.env[n]));
  const pk = process.env.FIREBASE_PRIVATE_KEY ?? "";
  out.pkShape = `len=${pk.length} startsQuote=${pk.startsWith('"')} hasRealNewline=${pk.includes("\n")} hasBackslashN=${pk.includes("\n")} beginsPem=${pk.replace(/^"/, "").startsWith("-----BEGIN")}`;
  for (const [k, f] of Object.entries({
    db: () => import("@/lib/server/firebase-admin"),
    account: () => import("@/lib/server/auth/account"),
  })) {
    try {
      await f();
      out[k] = "ok";
    } catch (e) {
      out[k] = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e);
    }
  }
  return NextResponse.json(out);
}
