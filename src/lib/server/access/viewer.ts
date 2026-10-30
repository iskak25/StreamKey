import "server-only";
import { Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import { ApiError } from "@/lib/shared/errors";
import { playerConfig } from "@/lib/shared/player";
import { appOrigin, sessionKey, SETTINGS, youtubePlaybackEnabled } from "../config";
import { computeSessionId } from "../crypto/tokens";
import { db } from "../firebase-admin";
import { COLLECTIONS, type AccessLinkDoc, type SessionDoc, type StreamDoc, type UserDoc } from "../schema";
import { assertViewable } from "./activate";

const DENIED = () => new ApiError("FORBIDDEN", "Доступ не подтверждён");

/**
 * Reads link -> (session, stream, owner) = 4 documents (spec 15.1). Every unknown/foreign/mismatched
 * combination collapses into one generic answer so linkIds cannot be probed.
 */
async function loadAuthorized(linkId: string, browserSecret: string) {
  const linkRef = db.collection(COLLECTIONS.accessLinks).doc(linkId);
  const link = (await linkRef.get()).data() as AccessLinkDoc | undefined;
  if (!link || link.status !== "ACTIVE" || link.sessionKeyVersion === null || !link.activeSessionId) throw DENIED();

  const sessionId = computeSessionId(sessionKey(link.sessionKeyVersion), link.sessionKeyVersion, browserSecret, linkId);
  if (sessionId !== link.activeSessionId) throw DENIED();

  const sessionRef = db.collection(COLLECTIONS.sessions).doc(sessionId);
  const [sessionSnap, streamSnap, ownerSnap] = (await db.getAll(
    sessionRef,
    db.collection(COLLECTIONS.streams).doc(link.streamId),
    db.collection(COLLECTIONS.users).doc(link.ownerUid),
  )) as [DocumentSnapshot, DocumentSnapshot, DocumentSnapshot];
  const session = sessionSnap.data() as SessionDoc | undefined;
  const stream = streamSnap.data() as StreamDoc | undefined;
  const owner = ownerSnap.data() as UserDoc | undefined;
  const nowMs = Date.now();

  if (!session || session.status !== "ACTIVE" || session.linkId !== linkId || session.streamId !== link.streamId || session.ownerUid !== link.ownerUid) {
    throw DENIED();
  }
  if (nowMs >= link.expiresAt.toMillis() || nowMs >= session.expiresAt.toMillis()) throw new ApiError("ACCESS_EXPIRED", "Срок доступа истёк");
  assertViewable(stream, owner, link, nowMs);
  if (session.streamAccessVersion !== stream.accessVersion) throw new ApiError("ACCESS_REVOKED", "Доступ закрыт");

  return { link, session, stream, sessionRef, nowMs };
}

export async function viewerAccess(linkId: string, browserSecret: string) {
  const { session, stream, nowMs } = await loadAuthorized(linkId, browserSecret);
  const leaseUntil = Math.min(nowMs + SETTINGS.leaseSeconds * 1000, session.expiresAt.toMillis());
  const playback = youtubePlaybackEnabled();
  return {
    title: stream.title,
    // ADR-0001: until the YouTube-policy decision is recorded the player runs in mock mode.
    mock: !playback,
    videoId: playback ? stream.youtubeVideoId : null,
    playerConfig: playerConfig(appOrigin()),
    serverTime: new Date(nowMs).toISOString(),
    leaseUntil: new Date(leaseUntil).toISOString(),
  };
}

/** lastSeenAt is a coarse activity hint: written at most once per interval, conditionally. */
export async function viewerSeen(linkId: string, browserSecret: string): Promise<void> {
  const { sessionRef } = await loadAuthorized(linkId, browserSecret);
  await db.runTransaction(async (tx) => {
    const s = (await tx.get(sessionRef)).data() as SessionDoc | undefined;
    if (!s || s.status !== "ACTIVE") return;
    const now = Timestamp.now();
    if (now.toMillis() - s.lastSeenAt.toMillis() < SETTINGS.seenIntervalSeconds * 1000) return;
    tx.update(sessionRef, { lastSeenAt: now });
  });
}
