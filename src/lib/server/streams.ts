import "server-only";
import { randomUUID } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError } from "@/lib/shared/errors";
import { canAccessStream, canCreateStreams } from "@/lib/shared/roles";
import { createStreamSchema } from "@/lib/validation/streams";
import { auditCreate } from "./audit";
import { playerConfig } from "@/lib/shared/player";
import { appOrigin, youtubePlaybackEnabled } from "./config";
import type { AccountContext } from "./auth/account";
import { db } from "./firebase-admin";
import { decodeCursor, encodeCursor } from "./pagination";
import { ACTIVE_STREAM_STATUSES, COLLECTIONS, SCHEMA_VERSION, type StreamDoc, type UsageDoc, type UserDoc } from "./schema";

export const updateStreamSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    accessStartsAt: z.coerce.date().optional(),
    accessEndsAt: z.coerce.date().optional(),
  })
  .strict();

const MAX_WINDOW_MS = 7 * 86_400_000;
const isCountedStatus = (s: StreamDoc["status"]) => (ACTIVE_STREAM_STATUSES as readonly string[]).includes(s);

export function streamDto(id: string, s: StreamDoc) {
  return {
    id,
    title: s.title,
    description: s.description,
    youtubeVideoId: s.youtubeVideoId,
    status: s.status,
    accessStartsAt: s.accessStartsAt.toDate().toISOString(),
    accessEndsAt: s.accessEndsAt.toDate().toISOString(),
    hasIssuedLinks: s.hasIssuedLinks,
    version: s.version,
    createdAt: s.createdAt.toDate().toISOString(),
  };
}

export async function createStream(acc: AccountContext, input: z.output<typeof createStreamSchema>, requestId: string) {
  if (!canCreateStreams(acc.actor, acc.user.permissions.canCreateStreams)) {
    throw new ApiError("FORBIDDEN", "Создание трансляций недоступно для этого аккаунта");
  }
  if (input.accessEndsAt.getTime() <= Date.now()) throw new ApiError("VALIDATION_ERROR", "Окно доступа уже закончилось");

  const streamRef = db.collection(COLLECTIONS.streams).doc();
  const usageRef = db.collection(COLLECTIONS.usage).doc(acc.actor.uid);
  const userRef = db.collection(COLLECTIONS.users).doc(acc.actor.uid);
  const eventId = randomUUID();

  return db.runTransaction(async (tx) => {
    const [userSnap, usageSnap] = await Promise.all([tx.get(userRef), tx.get(usageRef)]);
    const user = userSnap.data() as UserDoc | undefined;
    if (!user || user.status !== "ACTIVE" || !canCreateStreams({ ...acc.actor, role: user.role }, user.permissions.canCreateStreams)) {
      throw new ApiError("FORBIDDEN", "Создание трансляций недоступно для этого аккаунта");
    }
    const usage = (usageSnap.data() as UsageDoc | undefined) ?? { issuedLifetime: 0, activeStreams: 0 };
    if (usage.activeStreams >= user.limits.maxActiveStreams) {
      throw new ApiError("QUOTA_EXCEEDED", "Достигнут лимит активных трансляций");
    }

    const now = Timestamp.now();
    const doc: StreamDoc = {
      schemaVersion: SCHEMA_VERSION,
      ownerUid: acc.actor.uid,
      title: input.title,
      description: input.description ?? "",
      youtubeVideoId: input.youtube,
      status: "SCHEDULED",
      accessStartsAt: Timestamp.fromDate(input.accessStartsAt),
      accessEndsAt: Timestamp.fromDate(input.accessEndsAt),
      accessVersion: 0,
      hasIssuedLinks: false,
      version: 0,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    tx.create(streamRef, doc);
    tx.set(usageRef, { schemaVersion: SCHEMA_VERSION, issuedLifetime: usage.issuedLifetime, activeStreams: usage.activeStreams + 1, updatedAt: now });
    auditCreate(tx, { eventId, actorUid: acc.actor.uid, actorType: "USER", action: "STREAM_CREATED", targetType: "stream", targetId: streamRef.id, requestId }, now);
    return streamDto(streamRef.id, doc);
  });
}

export async function listStreams(acc: AccountContext, limit: number, cursorRaw: string | null) {
  const scope = `streams:${acc.actor.uid}`;
  const cursor = decodeCursor(scope, cursorRaw);
  let q = db
    .collection(COLLECTIONS.streams)
    .where("ownerUid", "==", acc.actor.uid)
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .limit(limit + 1);
  if (cursor) q = q.startAfter(cursor.ts, cursor.id);

  const snap = await q.get();
  const page = snap.docs.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((d) => streamDto(d.id, d.data() as StreamDoc)),
    nextCursor: snap.docs.length > limit && last ? encodeCursor(scope, (last.data() as StreamDoc).createdAt, last.id) : null,
  };
}

/** Returns NOT_FOUND for missing and foreign streams alike (no existence oracle). */
export async function getOwnedStream(acc: AccountContext, streamId: string): Promise<StreamDoc> {
  const snap = await db.collection(COLLECTIONS.streams).doc(streamId).get();
  const s = snap.data() as StreamDoc | undefined;
  if (!s || !canAccessStream(acc.actor, s)) throw new ApiError("NOT_FOUND", "Не найдено");
  return s;
}

/** Owner-only test view (spec 4.2): separate route, ownership checked, marked as preview by the UI. */
export async function previewStream(acc: AccountContext, streamId: string) {
  const s = await getOwnedStream(acc, streamId);
  const playback = youtubePlaybackEnabled();
  return {
    title: s.title,
    status: s.status,
    mock: !playback,
    videoId: playback ? s.youtubeVideoId : null,
    playerConfig: playerConfig(appOrigin()),
  };
}

export async function updateStream(acc: AccountContext, streamId: string, input: z.output<typeof updateStreamSchema>, requestId: string) {
  const ref = db.collection(COLLECTIONS.streams).doc(streamId);
  const eventId = randomUUID();
  return db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() as StreamDoc | undefined;
    if (!s || !canAccessStream(acc.actor, s)) throw new ApiError("NOT_FOUND", "Не найдено");
    if (s.version !== input.expectedVersion) throw new ApiError("VERSION_CONFLICT", "Данные были изменены, обновите страницу");
    if (!isCountedStatus(s.status)) throw new ApiError("FORBIDDEN", "Трансляция закрыта для изменений");

    const startsAt = input.accessStartsAt ? Timestamp.fromDate(input.accessStartsAt) : s.accessStartsAt;
    const endsAt = input.accessEndsAt ? Timestamp.fromDate(input.accessEndsAt) : s.accessEndsAt;
    const span = endsAt.toMillis() - startsAt.toMillis();
    if (span <= 0 || span > MAX_WINDOW_MS) throw new ApiError("VALIDATION_ERROR", "Некорректное окно доступа (1 сек … 7 суток)");

    const now = Timestamp.now();
    const patch = {
      title: input.title ?? s.title,
      description: input.description ?? s.description,
      accessStartsAt: startsAt,
      accessEndsAt: endsAt,
      version: s.version + 1,
      updatedAt: now,
    };
    tx.update(ref, patch);
    auditCreate(tx, { eventId, actorUid: acc.actor.uid, actorType: "USER", action: "STREAM_UPDATED", targetType: "stream", targetId: streamId, requestId }, now);
    return streamDto(streamId, { ...s, ...patch });
  });
}

/**
 * REVOKE / ARCHIVE: one write bumps accessVersion, so all links of the stream stop working
 * without touching them. activeStreams is decremented exactly once (only when leaving a counted state).
 */
export async function closeStream(acc: AccountContext, streamId: string, to: "REVOKED" | "ARCHIVED", requestId: string) {
  const ref = db.collection(COLLECTIONS.streams).doc(streamId);
  const eventId = randomUUID();
  return db.runTransaction(async (tx) => {
    const s = (await tx.get(ref)).data() as StreamDoc | undefined;
    if (!s || !canAccessStream(acc.actor, s)) throw new ApiError("NOT_FOUND", "Не найдено");
    if (s.status === to || s.status === "ARCHIVED") return streamDto(streamId, s);

    const usageRef = db.collection(COLLECTIONS.usage).doc(s.ownerUid);
    const usage = (await tx.get(usageRef)).data() as UsageDoc | undefined;

    const now = Timestamp.now();
    const patch = {
      status: to,
      accessVersion: s.accessVersion + 1,
      version: s.version + 1,
      updatedAt: now,
      archivedAt: to === "ARCHIVED" ? now : s.archivedAt,
    };
    tx.update(ref, patch);
    if (isCountedStatus(s.status) && usage) {
      tx.update(usageRef, { activeStreams: Math.max(0, usage.activeStreams - 1), updatedAt: now });
    }
    auditCreate(
      tx,
      { eventId, actorUid: acc.actor.uid, actorType: "USER", action: `STREAM_${to}`, targetType: "stream", targetId: streamId, requestId, before: { status: s.status }, after: { status: to } },
      now,
    );
    return streamDto(streamId, { ...s, ...patch });
  });
}
