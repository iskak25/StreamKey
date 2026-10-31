import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError } from "@/lib/shared/errors";
import { concertPhase } from "@/lib/shared/concerts";
import { auditCreate } from "./audit";
import { appOrigin } from "./config";
import type { AccountContext } from "./auth/account";
import { issueLink } from "./access/issue";
import { db } from "./firebase-admin";
import { paymentProvider } from "./payments/provider";
import { rateLimit } from "./ratelimit";
import { COLLECTIONS, SCHEMA_VERSION, type OrderDoc, type StreamDoc, type UserDoc } from "./schema";

const MAX_CLAIMS = 5;
/** A pending payment younger than this is reused on a repeated click instead of creating a second one. */
const PENDING_REUSE_MS = 10 * 60_000;
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const orderRef = (id: string) => db.collection(COLLECTIONS.orders).doc(id);
export const orderIdFor = (concertId: string, buyerUid: string) => `${concertId}_${buyerUid}`;

/** Deterministic UUIDv4-shaped Idempotency-Key: a double click replays the same link instead of issuing two. */
function claimKey(orderId: string, n: number): string {
  const h = createHash("sha256").update(`claim|${orderId}|${n}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function loadConcert(id: string): Promise<{ stream: StreamDoc; startsMs: number; endsMs: number }> {
  const s = (await db.collection(COLLECTIONS.streams).doc(id).get()).data() as StreamDoc | undefined;
  if (!s || s.publicationStatus !== "published") throw new ApiError("NOT_FOUND", "Не найдено");
  return { stream: s, startsMs: (s.startsAt ?? s.accessStartsAt).toMillis(), endsMs: (s.endsAt ?? s.accessEndsAt).toMillis() };
}

/** Buyer-owned order or NOT_FOUND (never reveal other people's orders). */
async function ownOrder(acc: AccountContext, id: string): Promise<OrderDoc> {
  const o = (await orderRef(id).get()).data() as OrderDoc | undefined;
  if (!o || o.buyerUid !== acc.actor.uid) throw new ApiError("NOT_FOUND", "Не найдено");
  return o;
}

export const orderDto = (id: string, o: OrderDoc) => ({
  id,
  concertId: o.concertId,
  status: o.status,
  amountKgs: o.amountKgs,
  paid: o.status === "PAID",
  /** True once a link was handed out: the UI then asks before replacing it. */
  claimed: o.claims > 0,
  /** Public identifier of the current link (a hash, not the secret): lets the buyer resume in the browser that already activated it. */
  linkId: o.linkId,
});

/** Marks the order paid exactly once. Idempotent: provider callbacks and the return path may both call it. */
export async function markPaid(orderId: string, providerRef: string | null, amountKgs: number, requestId: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ref = orderRef(orderId);
    const o = (await tx.get(ref)).data() as OrderDoc | undefined;
    if (!o) throw new ApiError("NOT_FOUND", "Не найдено");
    if (o.status === "PAID") return;
    if (o.amountKgs !== amountKgs) throw new ApiError("VALIDATION_ERROR", "Сумма платежа не совпадает с заказом");
    const now = Timestamp.now();
    tx.update(ref, { status: "PAID", paidAt: now, providerRef: providerRef ?? o.providerRef, updatedAt: now });
    auditCreate(
      tx,
      { eventId: randomUUID(), actorUid: o.buyerUid, actorType: "SYSTEM", action: "ORDER_PAID", targetType: "order", targetId: orderId, requestId, after: { concertId: o.concertId, amountKgs } },
      now,
    );
  });
}

/** Creates (or reuses) the buyer's order and a payment session. Free concerts are paid immediately. */
export async function startCheckout(acc: AccountContext, concertId: string, requestId: string): Promise<{ orderId: string; redirectUrl: string }> {
  await rateLimit(`checkout:${acc.actor.uid}`, 10, 60);
  const { stream, startsMs, endsMs } = await loadConcert(concertId);
  if (concertPhase(Date.now(), startsMs, endsMs) === "ended") throw new ApiError("ACCESS_EXPIRED", "Концерт уже завершён");
  const price = stream.priceKgs ?? 0;
  const orderId = orderIdFor(concertId, acc.actor.uid);

  const existing = (await orderRef(orderId).get()).data() as OrderDoc | undefined;
  if (existing?.status === "PAID") return { orderId, redirectUrl: `/orders/${orderId}` };
  // Double click / reload: the same pending order keeps its payment session. The price is re-read from the concert every time.
  if (existing?.status === "PENDING" && existing.paymentUrl && existing.amountKgs === price && Date.now() - existing.updatedAt.toMillis() < PENDING_REUSE_MS) {
    return { orderId, redirectUrl: existing.paymentUrl };
  }

  // Resolve the provider before writing anything, so an unconfigured provider leaves no orphan order.
  const provider = price > 0 ? paymentProvider() : null;
  const now = Timestamp.now();
  const paymentId = randomUUID();
  const order: OrderDoc = {
    schemaVersion: SCHEMA_VERSION,
    concertId,
    ownerUid: stream.ownerUid,
    buyerUid: acc.actor.uid,
    amountKgs: price,
    status: "PENDING",
    provider: provider?.name ?? "free",
    providerRef: null,
    paymentIds: [...(existing?.paymentIds ?? []), paymentId],
    paidAt: null,
    linkId: existing?.linkId ?? null,
    claims: existing?.claims ?? 0,
    paymentUrl: null,
    recoveryHash: existing?.recoveryHash ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await orderRef(orderId).set(order);

  if (!provider) {
    await markPaid(orderId, null, 0, requestId);
    return { orderId, redirectUrl: `/orders/${orderId}?fresh=1` };
  }
  const session = await provider.createPayment({ orderId, paymentId, returnUrl: `${appOrigin()}/orders/${orderId}`, amountKgs: price, description: stream.title });
  await orderRef(orderId).update({ providerRef: session.providerRef, paymentUrl: session.url, updatedAt: Timestamp.now() });
  return { orderId, redirectUrl: session.url };
}

/** Provider callbacks identify the payment by the id we sent, never by anything the buyer controls. */
export async function findOrderByPaymentId(paymentId: string): Promise<{ id: string; order: OrderDoc } | null> {
  const snap = await db.collection(COLLECTIONS.orders).where("paymentIds", "array-contains", paymentId).limit(1).get();
  const d = snap.docs[0];
  return d ? { id: d.id, order: d.data() as OrderDoc } : null;
}

/** The buyer order for a concert (any status), or null: the concert page then offers to watch, wait or pay. */
export async function orderStateFor(buyerUid: string, concertId: string): Promise<{ id: string; status: OrderDoc["status"] } | null> {
  const id = orderIdFor(concertId, buyerUid);
  const o = (await orderRef(id).get()).data() as OrderDoc | undefined;
  return o ? { id, status: o.status } : null;
}

/** concertId -> order status for one buyer (catalog cards show Watch / Awaiting payment from it). */
export async function ticketStatusMap(buyerUid: string): Promise<Record<string, OrderDoc["status"]>> {
  const snap = await db.collection(COLLECTIONS.orders).where("buyerUid", "==", buyerUid).limit(200).get();
  const out: Record<string, OrderDoc["status"]> = {};
  for (const d of snap.docs) {
    const o = d.data() as OrderDoc;
    if (out[o.concertId] !== "PAID") out[o.concertId] = o.status;
  }
  return out;
}

/** The buyer own tickets with just enough concert data to render them. Nothing about other buyers. */
export async function listMyTickets(buyerUid: string) {
  const snap = await db.collection(COLLECTIONS.orders).where("buyerUid", "==", buyerUid).limit(100).get();
  const now = Date.now();
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const o = d.data() as OrderDoc;
      if (o.status === "FAILED") return null;
      const s = (await db.collection(COLLECTIONS.streams).doc(o.concertId).get()).data() as StreamDoc | undefined;
      if (!s) return null;
      const startsMs = (s.startsAt ?? s.accessStartsAt).toMillis();
      const endsMs = (s.endsAt ?? s.accessEndsAt).toMillis();
      return {
        orderId: d.id,
        concertId: o.concertId,
        status: o.status,
        title: s.title,
        // The public cover route serves published concerts only.
        coverUrl: s.publicationStatus === "published" && s.coverPath && s.coverUpdatedAt ? `/api/v1/catalog/${o.concertId}/cover?v=${s.coverUpdatedAt.toMillis()}` : null,
        startsAt: new Date(startsMs).toISOString(),
        endsAt: new Date(endsMs).toISOString(),
        phase: concertPhase(now, startsMs, endsMs),
        withdrawn: s.publicationStatus !== "published",
        paidAtMs: o.paidAt?.toMillis() ?? o.createdAt.toMillis(),
      };
    }),
  );
  return rows.filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => b.paidAtMs - a.paidAtMs);
}

export async function getOrder(acc: AccountContext, id: string) {
  return { ...orderDto(id, await ownOrder(acc, id)), guest: acc.user.guest === true };
}

/** Mock provider only: the buyer "pays" on our test page. */
export async function completeMockPayment(acc: AccountContext, id: string, requestId: string): Promise<void> {
  if (process.env.PAYMENTS_PROVIDER !== "mock") throw new ApiError("NOT_FOUND", "Не найдено");
  const o = await ownOrder(acc, id);
  await markPaid(id, o.providerRef, o.amountKgs, requestId);
}

/**
 * Hands the buyer their personal one-time link after payment. The first call issues it
 * (a double click replays the same link). Later calls replace the previous link, which revokes
 * its browser binding, at most MAX_CLAIMS times.
 */
export async function claimAccess(acc: AccountContext, id: string, requestId: string): Promise<{ url: string }> {
  const o = await ownOrder(acc, id);
  if (o.status !== "PAID") throw new ApiError("FORBIDDEN", "Заказ не оплачен");
  const { stream, endsMs } = await loadConcert(o.concertId);
  if (endsMs <= Date.now()) throw new ApiError("ACCESS_EXPIRED", "Концерт уже завершён");
  if (o.claims >= MAX_CLAIMS) throw new ApiError("RATE_LIMITED", "Лимит повторной выдачи ссылки исчерпан. Обратитесь к организатору.");

  const owner = (await db.collection(COLLECTIONS.users).doc(o.ownerUid).get()).data() as UserDoc | undefined;
  if (!owner || owner.status !== "ACTIVE") throw new ApiError("OWNER_BLOCKED", "Доступ временно приостановлен");
  const ownerAcc: AccountContext = { actor: { uid: o.ownerUid, role: owner.role, status: owner.status }, user: owner };

  const replacing = o.claims > 0 && o.linkId;
  const r = await issueLink({
    acc: ownerAcc,
    idempotencyKey: claimKey(id, o.claims),
    route: `orders/${id}/access`,
    ...(replacing ? { replaceLinkId: o.linkId! } : { streamId: o.concertId }),
    label: `Билет ${acc.user.authEmail || `гость ${acc.actor.uid.slice(0, 6)}`}`.slice(0, 80),
    expiresAt: stream.accessEndsAt.toDate(),
    reason: replacing ? "ticket re-issued" : undefined,
    requestId,
    skipRateLimit: true,
  });
  if (!r.url) throw new ApiError("TEMPORARY_UNAVAILABLE", "Не удалось выдать ссылку, повторите");
  if (!r.replayed) await orderRef(id).update({ linkId: r.linkId, claims: o.claims + 1, updatedAt: Timestamp.now() });
  else if (o.claims === 0) await orderRef(id).update({ linkId: r.linkId, claims: 1, updatedAt: Timestamp.now() });
  return { url: r.url };
}

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");
const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z2-9]/g, "");

/**
 * Recovery code for a paid ticket: lets the buyer move it to a new session if the guest session is lost
 * (cleared browser data). Shown once; only its hash is stored, and a new code replaces the old one.
 */
export async function createRecoveryCode(acc: AccountContext, id: string): Promise<{ code: string }> {
  const o = await ownOrder(acc, id);
  if (o.status !== "PAID") throw new ApiError("FORBIDDEN", "Заказ не оплачен");
  const raw = Array.from(randomBytes(16), (b) => RECOVERY_ALPHABET[b % 32]).join("");
  await orderRef(id).update({ recoveryHash: hashCode(raw), updatedAt: Timestamp.now() });
  return { code: raw.match(/.{4}/g)!.join("-") };
}

/**
 * Moves a paid ticket to the current session. The code is single-use: the order is re-created under the
 * new buyer id (order ids embed the buyer), the old one is deleted. The issued access link keeps working.
 */
export async function recoverOrder(acc: AccountContext, rawCode: string, requestId: string): Promise<{ orderId: string }> {
  await rateLimit(`recover:${acc.actor.uid}`, 8, 600);
  const code = normalizeCode(rawCode);
  if (code.length !== 16) throw new ApiError("VALIDATION_ERROR", "Некорректный код");
  const snap = await db.collection(COLLECTIONS.orders).where("recoveryHash", "==", hashCode(code)).limit(1).get();
  const found = snap.docs[0];
  if (!found) throw new ApiError("NOT_FOUND", "Код не найден или уже использован");

  return db.runTransaction(async (tx) => {
    const oldRef = found.ref;
    const old = (await tx.get(oldRef)).data() as OrderDoc | undefined;
    if (!old || old.status !== "PAID" || old.recoveryHash !== hashCode(code)) throw new ApiError("NOT_FOUND", "Код не найден или уже использован");
    const newId = orderIdFor(old.concertId, acc.actor.uid);
    if (newId === oldRef.id) return { orderId: newId };
    const newRef = orderRef(newId);
    if ((await tx.get(newRef)).exists) throw new ApiError("IDEMPOTENCY_CONFLICT", "На этом аккаунте уже есть билет на этот концерт");
    const now = Timestamp.now();
    tx.create(newRef, { ...old, buyerUid: acc.actor.uid, recoveryHash: null, paymentUrl: null, updatedAt: now });
    tx.delete(oldRef);
    auditCreate(
      tx,
      { eventId: randomUUID(), actorUid: acc.actor.uid, actorType: acc.user.guest ? "GUEST" : "USER", action: "ORDER_RECOVERED", targetType: "order", targetId: newId, requestId, before: { buyerUid: old.buyerUid }, after: { concertId: old.concertId } },
      now,
    );
    return { orderId: newId };
  });
}
