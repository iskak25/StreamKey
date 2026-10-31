import { NextResponse, type NextRequest } from "next/server";
import { readCover } from "@/lib/server/concerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public cover of a PUBLISHED concert only; drafts and archived ones answer 404 like a missing id. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const cover = await readCover(id, "public");
    if (!cover) return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
    return new NextResponse(new Uint8Array(cover.data), {
      headers: { "content-type": cover.contentType, "x-content-type-options": "nosniff", "cache-control": req.nextUrl.searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300" },
    });
  } catch {
    return new NextResponse(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
