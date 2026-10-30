import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError } from "@/lib/shared/errors";
import { auditCreate } from "../audit";
import { activationsDisabled, sessionKey, sessionKeyVersion, SETTINGS } from "../config";
import { computeSessionId, isWellFormedToken, linkIdFromToken } from "../crypto/tokens";
import { db } from "../firebase-admin";
import { COLLECTIONS, RETENTION, SCHEMA_VERSION, type AccessLinkDoc, type SessionDoc, type StreamDoc, type UserDoc } from "../schema";
import { ratelimitActivate } from "./limits";

const DAY = 86_400_000;

export const newBrowserSecret = (): string => randomBytes(32).toString("base64url");
export const isValidBrowserSecret = (s: string | undefined): s is string => !!s && /^[A-Za-z0-9_-]{43}$/.test(s);

/** Shared gate: stream and owner must currently allow viewing. Throws the precise denial. */
export function assertViewable(stream: StreamDoc | undefined, owner: UserDoc | undefined, link: AccessLinkDoc, nowMs: number): asserts stream is StreamDoc {
  if (!stream || !owner || stream.ownerUid !== link.ownerUid) throw new ApiError("ACCESS_REVOKED", "Доступ закрыт");
  if (owner.status !== "ACTIVE") throw new ApiError("OWNER_BLOCKED", "Доступ приостановлен");
  if (owner.accessUntil && owner.accessUntil.toMillis() <= nowMs) throw new ApiError("OWNER_BLOCKED", "Доступ приостановлен");
  if (stream.status !== "SCHEDULED" && stream.status !== "LIVE") throw new ApiError("ACCESS_REVOKED", "Доступ закрыт");
  if (nowMs >= stream.accessEndsAt.toMillis()) throw new ApiError("ACCESS_EXPIRED", "Трансляция завершена");
  if (nowMs < stream.accessStartsAt.toMillis()) throw new ApiError("ACCESS_NOT_STARTED", "Трансляция ещё не началась");
}

/**
 * One-time activation (spec 8.2). One transaction: read link/stream/owner/session, then at most
 * create the session and flip the link to ACTIVE. Safe to retry after a lost response: same
 * token + same browser secret yields the same session.
 */
export async function activateLink(token: string, browserSecret: string, requestId: string): Promise<{ linkId: string }> {
  if (activationsDisabled()) throw new ApiError("TEMPORARY_UNAVAILABLE", "Активация временно отключена");
  if (!isWellFormedToken(token)) throw new ApiError("LINK_UNAVAILABLE", "Ссылка недоступна");

  await ratelimitActivate(createHash("sha256").update(browserSecret).digest("base64url"));

  const linkId = linkIdFromToken(token);
  const linkRef = db.collection(COLLECTIONS.accessLinks).doc(linkId);
  const eventId = randomUUID();
  const newKeyVersion = sessionKeyVersion();

  await db.runTransaction(async (tx) => {
    const link = (await tx.get(linkRef)).data() as AccessLinkDoc | undefined;
    if (!link) throw new ApiError("LINK_UNAVAILABLE", "Ссылка недоступна");

    const streamRef = db.collection(COLLECTIONS.streams).doc(link.streamId);
    const ownerRef = db.collection(COLLECTIONS.users).doc(link.ownerUid);
    // ACTIVE links keep verifying with the key version they were activated with.
    const version = link.status === "ACTIVE" && link.sessionKeyVersion !== null ? link.sessionKeyVersion : newKeyVersion;
    const sessionId = computeSessionId(sessionKey(version), version, browserSecret, linkId);
    const sessionRef = db.collection(COLLECTIONS.sessions).doc(sessionId);

    const [streamSnap, ownerSnap, sessionSnap] = await Promise.all([tx.get(streamRef), tx.get(ownerRef), tx.get(sessionRef)]);
    const stream = streamSnap.data() as StreamDoc | undefined;
    const owner = ownerSnap.data() as UserDoc | undefined;
    const session = sessionSnap.data() as SessionDoc | undefined;
    const nowTs = Timestamp.now();
    const nowMs = nowTs.toMillis();

    if (link.status === "REVOKED") throw new ApiError("ACCESS_REVOKED", "Ссылка отозвана");
    if (nowMs >= link.expiresAt.toMillis()) throw new ApiError("ACCESS_EXPIRED", "Срок ссылки истёк");
    assertViewable(stream, owner, link, nowMs);

    if (link.status === "ACTIVE") {
      const sameBrowser =
        link.activeSessionId === sessionId &&
        session !== undefined &&
        session.status === "ACTIVE" &&
        session.expiresAt.toMillis() > nowMs &&
        session.streamAccessVersion === stream.accessVersion;
      if (!sameBrowser) throw new ApiError("LINK_ALREADY_USED", "Ссылка уже активирована в другом браузере");
      return; // idempotent success
    }

    const expiresAt = Timestamp.fromMillis(
      Math.min(link.expiresAt.toMillis(), stream.accessEndsAt.toMillis(), nowMs + SETTINGS.guestSessionMaxHours * 3_600_000),
    );
    const newSession: SessionDoc = {
      schemaVersion: SCHEMA_VERSION,
      linkId,
      streamId: link.streamId,
      ownerUid: link.ownerUid,
      keyVersion: version,
      status: "ACTIVE",
      streamAccessVersion: stream.accessVersion,
      createdAt: nowTs,
      expiresAt,
      lastSeenAt: nowTs,
      revokedAt: null,
      purgeAt: Timestamp.fromMillis(expiresAt.toMillis() + RETENTION.sessionsAfterExpiryDays * DAY),
    };
    tx.create(sessionRef, newSession);
    tx.update(linkRef, { status: "ACTIVE", activeSessionId: sessionId, sessionKeyVersion: version, activatedAt: nowTs });
    auditCreate(
      tx,
      { eventId, actorUid: null, actorType: "GUEST", action: "LINK_ACTIVATED", targetType: "link", targetId: linkId, requestId, after: { streamId: link.streamId } },
      nowTs,
    );
  });

  return { linkId };
}
