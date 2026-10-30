import "server-only";
import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { db } from "./firebase-admin";
import { COLLECTIONS, RETENTION, SCHEMA_VERSION } from "./schema";

export interface AuditEvent {
  eventId: string;
  actorUid: string | null;
  actorType: "USER" | "GUEST" | "SYSTEM";
  action: string;
  targetType: string;
  targetId: string;
  requestId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Written inside the caller's transaction: a failed audit write aborts the action (spec 12.4). */
export function auditCreate(tx: Transaction, e: AuditEvent, now = Timestamp.now()): void {
  tx.create(db.collection(COLLECTIONS.auditLogs).doc(e.eventId), {
    schemaVersion: SCHEMA_VERSION,
    actorUid: e.actorUid,
    actorType: e.actorType,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    timestamp: now,
    requestId: e.requestId,
    before: e.before ?? null,
    after: e.after ?? null,
    reason: e.reason ?? null,
    purgeAt: Timestamp.fromMillis(now.toMillis() + RETENTION.auditDays * 86_400_000),
  });
}
