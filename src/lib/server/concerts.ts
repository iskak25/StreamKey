import "server-only";
import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { ApiError } from "@/lib/shared/errors";
import { concertPhase, type PublicationStatus } from "@/lib/shared/concerts";
import { createConcertSchema, checkWindow, updateConcertSchema } from "@/lib/validation/concerts";
import { auditCreate } from "./audit";
import type { AccountContext } from "./auth/account";
import { db } from "./firebase-admin";
import { closeStream } from "./streams";
import { COLLECTIONS, SCHEMA_VERSION, type StreamDoc, type UsageDoc } from "./schema";

const MAX_COVER_BYTES = 300_000;
const CARD_DESCRIPTION_CHARS = 160;

/** Server-side role gate for every admin concert operation (hiding a link in the UI is not a control). */
export function requireAdmin(acc: AccountContext): void {
  if (acc.actor.status !== "ACTIVE" || (acc.actor.role !== "ADMIN" && acc.actor.role !== "SUPER_ADMIN")) {
    throw new ApiError("FORBIDDEN", "Недостаточно прав");
  }
}

const ref = (id: string) => db.collection(COLLECTIONS.streams).doc(id);

const coverUrl = (id: string, s: StreamDoc, scope: "public" | "admin"): string | null =>
  s.coverPath && s.coverUpdatedAt ? `/api/v1/${scope === "public" ? "catalog" : "admin/concerts"}/${id}/cover?v=${s.coverUpdatedAt.toMillis()}` : null;

/** Everything the admin UI needs, including the video id (admin-only). */
export function adminConcertDto(id: string, s: StreamDoc) {
  return {
    id,
    title: s.title,
    description: s.description,
    youtubeVideoId: s.youtubeVideoId,
    priceKgs: s.priceKgs ?? 0,
    startsAt: (s.startsAt ?? s.accessStartsAt).toDate().toISOString(),
    endsAt: (s.endsAt ?? s.accessEndsAt).toDate().toISOString(),
    publicationStatus: s.publicationStatus ?? "draft",
    coverUrl: coverUrl(id, s, "admin"),
    hasIssuedLinks: s.hasIssuedLinks,
    version: s.version,
    createdAt: s.createdAt.toDate().toISOString(),
    updatedAt: s.updatedAt.toDate().toISOString(),
  };
}

/** Public catalog shape: an allow-list. No video id, no owner, no internal status, no access window. */
export function publicConcertDto(id: string, s: StreamDoc, full: boolean, nowMs = Date.now()) {
  const startsAt = (s.startsAt ?? s.accessStartsAt).toMillis();
  const endsAt = (s.endsAt ?? s.accessEndsAt).toMillis();
  return {
    id,
    title: s.title,
    description: full || s.description.length <= CARD_DESCRIPTION_CHARS ? s.description : `${s.description.slice(0, CARD_DESCRIPTION_CHARS).trimEnd()}…`,
    coverUrl: coverUrl(id, s, "public"),
    priceKgs: s.priceKgs ?? 0,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    phase: concertPhase(nowMs, startsAt, endsAt),
  };
}

async function loadConcert(id: string): Promise<StreamDoc> {
  const s = (await ref(id).get()).data() as StreamDoc | undefined;
  if (!s || !s.publicationStatus) throw new ApiError("NOT_FOUND", "Не найдено");
  return s;
}

export async function createConcert(acc: AccountContext, input: z.output<typeof createConcertSchema>, requestId: string) {
  requireAdmin(acc);
  const streamRef = db.collection(COLLECTIONS.streams).doc();
  const usageRef = db.collection(COLLECTIONS.usage).doc(acc.actor.uid);
  const eventId = randomUUID();
  return db.runTransaction(async (tx) => {
    const usage = (await tx.get(usageRef)).data() as UsageDoc | undefined;
    const now = Timestamp.now();
    const starts = Timestamp.fromDate(input.startsAt);
    const ends = Timestamp.fromDate(input.endsAt);
    const doc: StreamDoc = {
      schemaVersion: SCHEMA_VERSION,
      ownerUid: acc.actor.uid,
      createdBy: acc.actor.uid,
      title: input.title,
      description: input.description,
      youtubeVideoId: input.youtube,
      status: "SCHEDULED",
      // The existing access-window machinery (links, viewer) keeps working unchanged: it mirrors the concert dates.
      accessStartsAt: starts,
      accessEndsAt: ends,
      accessVersion: 0,
      hasIssuedLinks: false,
      linksIssued: 0,
      priceKgs: input.priceKgs,
      startsAt: starts,
      endsAt: ends,
      publicationStatus: "draft",
      coverPath: null,
      coverUpdatedAt: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    tx.create(streamRef, doc);
    // Counted like any active stream so that archiving (closeStream) keeps the owner counter consistent. No quota for admins.
    tx.set(usageRef, { schemaVersion: SCHEMA_VERSION, issuedLifetime: usage?.issuedLifetime ?? 0, activeStreams: (usage?.activeStreams ?? 0) + 1, updatedAt: now });
    auditCreate(tx, { eventId, actorUid: acc.actor.uid, actorType: "USER", action: "CONCERT_CREATED", targetType: "stream", targetId: streamRef.id, requestId }, now);
    return adminConcertDto(streamRef.id, doc);
  });
}

export async function updateConcert(acc: AccountContext, id: string, input: z.output<typeof updateConcertSchema>, requestId: string) {
  requireAdmin(acc);
  const eventId = randomUUID();
  return db.runTransaction(async (tx) => {
    const s = (await tx.get(ref(id))).data() as StreamDoc | undefined;
    if (!s || !s.publicationStatus) throw new ApiError("NOT_FOUND", "Не найдено");
    if (s.version !== input.expectedVersion) throw new ApiError("VERSION_CONFLICT", "Данные были изменены, обновите страницу");
    if (s.publicationStatus === "archived") throw new ApiError("FORBIDDEN", "Трансляция в архиве");

    const startsAt = input.startsAt ? Timestamp.fromDate(input.startsAt) : (s.startsAt ?? s.accessStartsAt);
    const endsAt = input.endsAt ? Timestamp.fromDate(input.endsAt) : (s.endsAt ?? s.accessEndsAt);
    const windowError = checkWindow(startsAt.toDate(), endsAt.toDate());
    if (windowError) throw new ApiError("VALIDATION_ERROR", windowError);

    const now = Timestamp.now();
    const patch = {
      title: input.title ?? s.title,
      description: input.description ?? s.description,
      youtubeVideoId: input.youtube ?? s.youtubeVideoId,
      priceKgs: input.priceKgs ?? s.priceKgs ?? 0,
      startsAt,
      endsAt,
      accessStartsAt: startsAt,
      accessEndsAt: endsAt,
      version: s.version + 1,
      updatedAt: now,
    };
    tx.update(ref(id), patch);
    auditCreate(tx, { eventId, actorUid: acc.actor.uid, actorType: "USER", action: "CONCERT_UPDATED", targetType: "stream", targetId: id, requestId }, now);
    return adminConcertDto(id, { ...s, ...patch });
  });
}

export async function setPublication(acc: AccountContext, id: string, to: Exclude<PublicationStatus, "archived">, requestId: string) {
  requireAdmin(acc);
  const eventId = randomUUID();
  return db.runTransaction(async (tx) => {
    const s = (await tx.get(ref(id))).data() as StreamDoc | undefined;
    if (!s || !s.publicationStatus) throw new ApiError("NOT_FOUND", "Не найдено");
    if (s.publicationStatus === "archived") throw new ApiError("FORBIDDEN", "Трансляция в архиве");
    if (to === "published" && (s.endsAt ?? s.accessEndsAt).toMillis() <= Date.now()) {
      throw new ApiError("VALIDATION_ERROR", "Нельзя опубликовать концерт, который уже закончился");
    }
    if (s.publicationStatus === to) return adminConcertDto(id, s);
    const now = Timestamp.now();
    const patch = { publicationStatus: to, version: s.version + 1, updatedAt: now };
    tx.update(ref(id), patch);
    auditCreate(
      tx,
      { eventId, actorUid: acc.actor.uid, actorType: "USER", action: to === "published" ? "CONCERT_PUBLISHED" : "CONCERT_UNPUBLISHED", targetType: "stream", targetId: id, requestId },
      now,
    );
    return adminConcertDto(id, { ...s, ...patch });
  });
}

/** Archive: unpublishes and closes access (the existing closeStream bumps accessVersion and keeps counters right). */
export async function archiveConcert(acc: AccountContext, id: string, requestId: string) {
  requireAdmin(acc);
  await loadConcert(id);
  await closeStream(acc, id, "ARCHIVED", requestId);
  const s = (await ref(id).get()).data() as StreamDoc;
  if (s.publicationStatus !== "archived") {
    const now = Timestamp.now();
    const patch = { publicationStatus: "archived" as const, version: s.version + 1, updatedAt: now };
    await ref(id).update(patch);
    return adminConcertDto(id, { ...s, ...patch });
  }
  return adminConcertDto(id, s);
}

export async function listAdminConcerts(acc: AccountContext) {
  requireAdmin(acc);
  const statuses: PublicationStatus[] = ["draft", "published", "archived"];
  const snaps = await Promise.all(statuses.map((st) => db.collection(COLLECTIONS.streams).where("publicationStatus", "==", st).limit(200).get()));
  return snaps
    .flatMap((snap) => snap.docs)
    .map((d) => ({ id: d.id, s: d.data() as StreamDoc }))
    .sort((a, b) => b.s.createdAt.toMillis() - a.s.createdAt.toMillis())
    .map(({ id, s }) => adminConcertDto(id, s));
}

export async function getAdminConcert(acc: AccountContext, id: string) {
  requireAdmin(acc);
  return adminConcertDto(id, await loadConcert(id));
}

// ---------- public catalog ----------

const PHASE_ORDER = { live: 0, soon: 1, ended: 2 } as const;

export async function listPublishedConcerts() {
  const snap = await db.collection(COLLECTIONS.streams).where("publicationStatus", "==", "published").limit(100).get();
  const now = Date.now();
  return snap.docs
    .map((d) => publicConcertDto(d.id, d.data() as StreamDoc, false, now))
    .sort(
      (a, b) =>
        PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] ||
        (a.phase === "ended" ? Date.parse(b.startsAt) - Date.parse(a.startsAt) : Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    );
}

export async function getPublishedConcert(id: string) {
  const s = (await ref(id).get()).data() as StreamDoc | undefined;
  if (!s || s.publicationStatus !== "published") throw new ApiError("NOT_FOUND", "Не найдено");
  return publicConcertDto(id, s, true);
}

// ---------- covers ----------

function sniffImage(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function setCover(acc: AccountContext, id: string, bytes: Buffer, requestId: string) {
  requireAdmin(acc);
  if (bytes.length === 0 || bytes.length > MAX_COVER_BYTES) throw new ApiError("VALIDATION_ERROR", "Обложка должна быть не больше 300 КБ");
  const contentType = sniffImage(bytes); // the file signature decides, never a client-supplied header
  if (!contentType) throw new ApiError("VALIDATION_ERROR", "Допустимы JPEG, PNG и WebP");
  const now = Timestamp.now();
  const coverRef = db.collection(COLLECTIONS.streamCovers).doc(id);
  const eventId = randomUUID();
  return db.runTransaction(async (tx) => {
    const s = (await tx.get(ref(id))).data() as StreamDoc | undefined;
    if (!s || !s.publicationStatus) throw new ApiError("NOT_FOUND", "Не найдено");
    if (s.publicationStatus === "archived") throw new ApiError("FORBIDDEN", "Трансляция в архиве");
    tx.set(coverRef, { schemaVersion: SCHEMA_VERSION, contentType, data: bytes, size: bytes.length, updatedAt: now });
    const patch = { coverPath: `${COLLECTIONS.streamCovers}/${id}`, coverUpdatedAt: now, version: s.version + 1, updatedAt: now };
    tx.update(ref(id), patch);
    auditCreate(tx, { eventId, actorUid: acc.actor.uid, actorType: "USER", action: "CONCERT_COVER_SET", targetType: "stream", targetId: id, requestId }, now);
    return adminConcertDto(id, { ...s, ...patch });
  });
}

export async function readCover(id: string, visibility: "public" | "admin"): Promise<{ contentType: string; data: Buffer } | null> {
  const s = (await ref(id).get()).data() as StreamDoc | undefined;
  if (!s || !s.publicationStatus || (visibility === "public" && s.publicationStatus !== "published")) return null;
  const c = (await db.collection(COLLECTIONS.streamCovers).doc(id).get()).data() as { contentType: string; data: Buffer } | undefined;
  return c ? { contentType: c.contentType, data: Buffer.from(c.data) } : null;
}
