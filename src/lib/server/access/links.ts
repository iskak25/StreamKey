import "server-only";
import { randomUUID } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError } from "@/lib/shared/errors";
import { canAccessStream } from "@/lib/shared/roles";
import { auditCreate } from "../audit";
import type { AccountContext } from "../auth/account";
import { db } from "../firebase-admin";
import { decodeCursor, encodeCursor } from "../pagination";
import { COLLECTIONS, type AccessLinkDoc, type SessionDoc } from "../schema";
import { getOwnedStream } from "../streams";

export const revokeLinkSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();

/** EXPIRED is derived, never stored (spec 7.2). */
export function linkDto(id: string, l: AccessLinkDoc, now = Date.now()) {
  const status = l.status !== "REVOKED" && l.expiresAt.toMillis() <= now ? "EXPIRED" : l.status;
  return {
    linkId: id,
    status,
    label: l.label,
    createdAt: l.createdAt.toDate().toISOString(),
    expiresAt: l.expiresAt.toDate().toISOString(),
    activatedAt: l.activatedAt?.toDate().toISOString() ?? null,
    revokedAt: l.revokedAt?.toDate().toISOString() ?? null,
    replacedLinkId: l.replacedLinkId,
  };
}

export async function listLinks(acc: AccountContext, streamId: string, limit: number, cursorRaw: string | null) {
  await getOwnedStream(acc, streamId); // owner check before any data is returned
  const scope = `links:${streamId}`;
  const cursor = decodeCursor(scope, cursorRaw);
  let q = db
    .collection(COLLECTIONS.accessLinks)
    .where("streamId", "==", streamId)
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .limit(limit + 1);
  if (cursor) q = q.startAfter(cursor.ts, cursor.id);

  const snap = await q.get();
  const page = snap.docs.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((d) => linkDto(d.id, d.data() as AccessLinkDoc)),
    nextCursor: snap.docs.length > limit && last ? encodeCursor(scope, (last.data() as AccessLinkDoc).createdAt, last.id) : null,
  };
}

export async function revokeLink(acc: AccountContext, linkId: string, reason: string, requestId: string) {
  const linkRef = db.collection(COLLECTIONS.accessLinks).doc(linkId);
  const eventId = randomUUID();
  return db.runTransaction(async (tx) => {
    const link = (await tx.get(linkRef)).data() as AccessLinkDoc | undefined;
    if (!link || !canAccessStream(acc.actor, { ownerUid: link.ownerUid })) throw new ApiError("NOT_FOUND", "Не найдено");
    if (link.status === "REVOKED") return linkDto(linkId, link);

    const sessionRef = link.activeSessionId ? db.collection(COLLECTIONS.sessions).doc(link.activeSessionId) : null;
    const session = sessionRef ? ((await tx.get(sessionRef)).data() as SessionDoc | undefined) : undefined;

    const now = Timestamp.now();
    tx.update(linkRef, { status: "REVOKED", revokedAt: now, revokeReason: reason });
    if (sessionRef && session?.status === "ACTIVE") tx.update(sessionRef, { status: "REVOKED", revokedAt: now });
    auditCreate(
      tx,
      { eventId, actorUid: acc.actor.uid, actorType: "USER", action: "LINK_REVOKED", targetType: "link", targetId: linkId, requestId, before: { status: link.status }, after: { status: "REVOKED" }, reason },
      now,
    );
    return linkDto(linkId, { ...link, status: "REVOKED", revokedAt: now, revokeReason: reason });
  });
}
