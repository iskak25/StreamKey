import { NextResponse } from "next/server";
import { listPublishedConcerts } from "@/lib/server/concerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, no session. Allow-listed fields only (see publicConcertDto): no video id, no internal status. */
export async function GET() {
  try {
    return NextResponse.json({ items: await listPublishedConcerts() }, { headers: { "cache-control": "public, max-age=15, s-maxage=15" } });
  } catch {
    return NextResponse.json({ error: { code: "TEMPORARY_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
