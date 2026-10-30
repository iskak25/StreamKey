import { Timestamp } from "firebase-admin/firestore";
import { ApiError } from "@/lib/shared/errors";

export interface Cursor {
  s: number;
  n: number;
  id: string;
}

/** Opaque cursor bound to a scope (owner uid + filters) so it cannot be replayed elsewhere. */
export function encodeCursor(scope: string, ts: Timestamp, id: string): string {
  return Buffer.from(JSON.stringify({ k: scope, s: ts.seconds, n: ts.nanoseconds, id })).toString("base64url");
}

export function decodeCursor(scope: string, raw: string | null): { ts: Timestamp; id: string } | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor & { k: string };
    if (c.k !== scope || typeof c.s !== "number" || typeof c.n !== "number" || typeof c.id !== "string") throw new Error();
    return { ts: new Timestamp(c.s, c.n), id: c.id };
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Некорректный курсор");
  }
}

export function parseLimit(raw: string | null): number {
  if (raw === null) return 25;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new ApiError("VALIDATION_ERROR", "limit: 1..100");
  return n;
}
