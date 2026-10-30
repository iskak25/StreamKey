import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError } from "@/lib/shared/errors";
import { canAccessStream, canCreateStreams } from "@/lib/shared/roles";
import { auditCreate } from "../audit";
import type { AccountContext } from "../auth/account";
import { appOrigin, receiptKey, receiptKeyVersion, SETTINGS } from "../config";
import { decryptReceipt, encryptReceipt, type EncryptedReceipt } from "../crypto/receipt";
import { generateToken, linkIdFromToken } from "../crypto/tokens";
import { db } from "../firebase-admin";
import { ratelimitCreate } from "./limits";
import {
  ACTIVE_STREAM_STATUSES,
  COLLECTIONS,
  RETENTION,
  SCHEMA_VERSION,
  type AccessLinkDoc,
  type IdempotencyDoc,
  type SessionDoc,
  type StreamDoc,
  type UsageDoc,
  type UserDoc,
} from "../schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;

export interface IssueInput {
  acc: AccountContext;
  idempotencyKey: string | null;
  /** Route identity for the idempotency scope, e.g. `streams/<id>/links`. */
  route: string;
  streamId?: string;
  replaceLinkId?: string;
  label: string | null;
  expiresAt: Date;
  reason?: string;
  requestId: string;
}

export interface IssueResult {
  linkId: string;
  expiresAt: string;
  /** Null on replay after the receipt window: the secret cannot be recovered any more. */
  url: string | null;
  secretAvailable: boolean;
  replayed: boolean;
}

type Outcome = { kind: "created"; expiresAt: string } | { kind: "replay"; prev: IdempotencyDoc };

const sha = (s: string) => createHash("sha256").update(s).digest("base64url");

/**
 * Issues exactly one link (optionally replacing another) in one commit:
 * idempotency record, link, quota counter, stream flag, audit and — for replace — revocation of the old link/session.
 */
export async function issueLink(input: IssueInput): Promise<IssueResult> {
  const { acc } = input;
  if (!input.idempotencyKey || !UUID.test(input.idempotencyKey)) {
    throw new ApiError("VALIDATION_ERROR", "Требуется заголовок Idempotency-Key (UUID)");
  }
  await ratelimitCreate(acc.actor.uid);

  const idemId = sha(`${acc.actor.uid}\n${input.route}\n${input.idempotencyKey}`);
  const requestHash = sha(
    JSON.stringify([input.streamId ?? null, input.replaceLinkId ?? null, input.label, input.expiresAt.getTime()]),
  );

  // Everything random is decided before the (retryable) transaction callback.
  const token = generateToken();
  const linkId = linkIdFromToken(token);
  const eventId = randomUUID();
  const keyVersion = receiptKeyVersion();
  const receipt = encryptReceipt(receiptKey(keyVersion), keyVersion, token, acc.actor.uid, idemId);

  const idemRef = db.collection(COLLECTIONS.idempotency).doc(idemId);
  const linkRef = db.collection(COLLECTIONS.accessLinks).doc(linkId);

  const outcome = await db.runTransaction<Outcome>(async (tx) => {
    const idemSnap = await tx.get(idemRef);
    if (idemSnap.exists) {
      const prev = idemSnap.data() as IdempotencyDoc;
      if (prev.requestHash !== requestHash) throw new ApiError("IDEMPOTENCY_CONFLICT", "Idempotency-Key уже использован с другим запросом");
      return { kind: "replay", prev };
    }

    const oldRef = input.replaceLinkId ? db.collection(COLLECTIONS.accessLinks).doc(input.replaceLinkId) : null;
    const oldLink = oldRef ? ((await tx.get(oldRef)).data() as AccessLinkDoc | undefined) : undefined;
    if (oldRef && !oldLink) throw new ApiError("NOT_FOUND", "Не найдено");

    const streamId = input.streamId ?? oldLink?.streamId;
    if (!streamId) throw new ApiError("VALIDATION_ERROR", "Не указана трансляция");
    if (oldLink && oldLink.streamId !== streamId) throw new ApiError("NOT_FOUND", "Не найдено");

    const streamRef = db.collection(COLLECTIONS.streams).doc(streamId);
    const stream = (await tx.get(streamRef)).data() as StreamDoc | undefined;
    if (!stream || !canAccessStream(acc.actor, stream)) throw new ApiError("NOT_FOUND", "Не найдено");

    const actorRef = db.collection(COLLECTIONS.users).doc(acc.actor.uid);
    const ownerRef = db.collection(COLLECTIONS.users).doc(stream.ownerUid);
    const usageRef = db.collection(COLLECTIONS.usage).doc(stream.ownerUid);
    const oldSessionRef = oldLink?.activeSessionId ? db.collection(COLLECTIONS.sessions).doc(oldLink.activeSessionId) : null;

    const [actorSnap, ownerSnap, usageSnap, oldSessionSnap] = await Promise.all([
      tx.get(actorRef),
      stream.ownerUid === acc.actor.uid ? Promise.resolve(null) : tx.get(ownerRef),
      tx.get(usageRef),
      oldSessionRef ? tx.get(oldSessionRef) : Promise.resolve(null),
    ]);

    const actorUser = actorSnap.data() as UserDoc | undefined;
    if (!actorUser || actorUser.status !== "ACTIVE" || !canCreateStreams({ ...acc.actor, role: actorUser.role }, actorUser.permissions.canCreateStreams)) {
      throw new ApiError("FORBIDDEN", "Выдача ссылок недоступна для этого аккаунта");
    }
    const owner = ownerSnap ? (ownerSnap.data() as UserDoc | undefined) : actorUser;
    if (!owner || owner.status !== "ACTIVE") throw new ApiError("OWNER_BLOCKED", "Владелец трансляции заблокирован");

    const now = Timestamp.now();
    if (!(ACTIVE_STREAM_STATUSES as readonly string[]).includes(stream.status)) throw new ApiError("ACCESS_REVOKED", "Трансляция закрыта");
    if (stream.accessEndsAt.toMillis() <= now.toMillis()) throw new ApiError("ACCESS_EXPIRED", "Окно доступа трансляции закончилось");
    if (input.expiresAt.getTime() <= now.toMillis() || input.expiresAt.getTime() > stream.accessEndsAt.toMillis()) {
      throw new ApiError("VALIDATION_ERROR", "Срок ссылки должен быть в будущем и не позже конца окна трансляции");
    }

    const usage = (usageSnap.data() as UsageDoc | undefined) ?? { issuedLifetime: 0, activeStreams: 0 };
    if (usage.issuedLifetime >= owner.limits.maxLinksLifetime) throw new ApiError("QUOTA_EXCEEDED", "Лимит выданных ссылок исчерпан");

    const expiresAt = Timestamp.fromDate(input.expiresAt);
    const link: AccessLinkDoc = {
      schemaVersion: SCHEMA_VERSION,
      ownerUid: stream.ownerUid,
      streamId,
      status: "ISSUED",
      label: input.label,
      createdByUid: acc.actor.uid,
      createdAt: now,
      expiresAt,
      activatedAt: null,
      activeSessionId: null,
      sessionKeyVersion: null,
      revokedAt: null,
      revokeReason: null,
      replacedLinkId: input.replaceLinkId ?? null,
      purgeAt: Timestamp.fromMillis(expiresAt.toMillis() + RETENTION.linksAfterExpiryDays * DAY),
    };
    const idem: IdempotencyDoc = {
      schemaVersion: SCHEMA_VERSION,
      actorUid: acc.actor.uid,
      route: input.route,
      requestHash,
      resourceId: linkId,
      encryptedReceipt: JSON.stringify(receipt),
      receiptKeyVersion: keyVersion,
      replayUntil: Timestamp.fromMillis(now.toMillis() + SETTINGS.receiptReplayMinutes * 60_000),
      createdAt: now,
      purgeAt: Timestamp.fromMillis(now.toMillis() + RETENTION.idempotencyHours * 3_600_000),
    };

    // --- writes ---
    tx.create(linkRef, link);
    tx.create(idemRef, idem);
    tx.set(usageRef, { schemaVersion: SCHEMA_VERSION, issuedLifetime: usage.issuedLifetime + 1, activeStreams: usage.activeStreams, updatedAt: now });
    if (!stream.hasIssuedLinks) tx.update(streamRef, { hasIssuedLinks: true, updatedAt: now });

    if (oldRef && oldLink && oldLink.status !== "REVOKED") {
      tx.update(oldRef, { status: "REVOKED", revokedAt: now, revokeReason: input.reason ?? "replaced" });
      if (oldSessionRef && oldSessionSnap?.exists && (oldSessionSnap.data() as SessionDoc).status === "ACTIVE") {
        tx.update(oldSessionRef, { status: "REVOKED", revokedAt: now });
      }
    }
    auditCreate(
      tx,
      {
        eventId,
        actorUid: acc.actor.uid,
        actorType: "USER",
        action: oldRef ? "LINK_REPLACED" : "LINK_ISSUED",
        targetType: "link",
        targetId: linkId,
        requestId: input.requestId,
        after: { streamId, replacedLinkId: input.replaceLinkId ?? null },
        reason: input.reason ?? null,
      },
      now,
    );
    return { kind: "created", expiresAt: expiresAt.toDate().toISOString() };
  });

  if (outcome.kind === "created") {
    return {
      linkId,
      expiresAt: outcome.expiresAt,
      url: `${appOrigin()}/invite#t=${token}`,
      secretAvailable: true,
      replayed: false,
    };
  }

  // Replay: same resource, no new quota. Token is recoverable only inside the receipt window.
  const prev = outcome.prev;
  const expiresAt = ((await db.collection(COLLECTIONS.accessLinks).doc(prev.resourceId).get()).data() as AccessLinkDoc | undefined)?.expiresAt;
  let url: string | null = null;
  if (prev.encryptedReceipt && prev.receiptKeyVersion !== null) {
    const stored = JSON.parse(prev.encryptedReceipt) as EncryptedReceipt;
    const plain = decryptReceipt(receiptKey(prev.receiptKeyVersion), stored, acc.actor.uid, idemId, prev.replayUntil.toDate());
    if (plain) url = `${appOrigin()}/invite#t=${plain}`;
  }
  return {
    linkId: prev.resourceId,
    expiresAt: expiresAt ? expiresAt.toDate().toISOString() : input.expiresAt.toISOString(),
    url,
    secretAvailable: url !== null,
    replayed: true,
  };
}
