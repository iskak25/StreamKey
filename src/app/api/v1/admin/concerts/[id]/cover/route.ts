import { NextResponse } from "next/server";
import { ApiError } from "@/lib/shared/errors";
import { requireAccount } from "@/lib/server/auth/account";
import { readCover, requireAdmin, setCover } from "@/lib/server/concerts";
import { ok, route } from "@/lib/server/http";

export const runtime = "nodejs";

const MAX_BYTES = 300_000;

/** Raw image bytes in the body (the client resizes to a small JPEG first). Content type is sniffed server-side. */
export const PUT = route<{ id: string }>({}, async ({ req, params, requestId }) => {
  const acc = await requireAccount(req);
  requireAdmin(acc);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) throw new ApiError("VALIDATION_ERROR", "Обложка должна быть не больше 300 КБ");
  const bytes = Buffer.from(await req.arrayBuffer());
  return ok(await setCover(acc, params.id, bytes, requestId));
});

export const GET = route<{ id: string }>({}, async ({ req, params }) => {
  requireAdmin(await requireAccount(req));
  const cover = await readCover(params.id, "admin");
  if (!cover) throw new ApiError("NOT_FOUND", "Не найдено");
  return new NextResponse(new Uint8Array(cover.data), { headers: { "content-type": cover.contentType, "x-content-type-options": "nosniff" } });
});
