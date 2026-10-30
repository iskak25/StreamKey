import "server-only";
import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError } from "@/lib/shared/errors";
import { db } from "./firebase-admin";
import { COLLECTIONS, SCHEMA_VERSION } from "./schema";

/**
 * Fixed-window counter in a short-lived Firestore bucket. Only for authenticated or
 * otherwise bounded keys (uid, browser-secret hash): never key it by an attacker-chosen
 * token, that would let an attacker create documents at will (spec 14.2).
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const nowMs = Date.now();
  const windowStart = Math.floor(nowMs / (windowSeconds * 1000));
  const id = createHash("sha256").update(`${key}|${windowStart}`).digest("base64url");
  const ref = db.collection(COLLECTIONS.rateBuckets).doc(id);

  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = ((snap.data()?.count as number | undefined) ?? 0) + 1;
    tx.set(ref, {
      schemaVersion: SCHEMA_VERSION,
      count: next,
      purgeAt: Timestamp.fromMillis((windowStart + 2) * windowSeconds * 1000),
    });
    return next;
  });

  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil(((windowStart + 1) * windowSeconds * 1000 - nowMs) / 1000));
    throw new ApiError("RATE_LIMITED", "Слишком много запросов", { "Retry-After": String(retryAfter) });
  }
}
