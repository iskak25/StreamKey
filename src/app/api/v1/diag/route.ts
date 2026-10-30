import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY diagnostics for the Vercel 500 (removed after). Reports import failures, no secrets.
export async function GET() {
  const out: Record<string, string> = {
    node: process.version,
    demoEnv: String(process.env.DEMO_MODE),
    hasFbEmail: String(!!process.env.FIREBASE_CLIENT_EMAIL),
    hasGac: String(!!process.env.GOOGLE_APPLICATION_CREDENTIALS),
    hasEmu: String(!!process.env.FIRESTORE_EMULATOR_HOST),
  };
  for (const [k, f] of Object.entries({
    config: () => import("@/lib/server/config"),
    fsAdmin: () => import("firebase-admin/firestore"),
    db: () => import("@/lib/server/firebase-admin"),
    account: () => import("@/lib/server/auth/account"),
  })) {
    try {
      await f();
      out[k] = "ok";
    } catch (e) {
      out[k] = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 400) : String(e);
    }
  }
  return NextResponse.json(out);
}
