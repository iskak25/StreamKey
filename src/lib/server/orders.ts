import "server-only";
import { createHash, randomUUID } from "node:crypto";
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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await orderRef(orderId).set(order);

  if (!provider) {
    await markPaid(orderId, null, 0, requestId);
    return { orderId, redirectUrl: `/orders/${orderId}?fresh=1` };
  }
  const session = await provider.createPayment({ orderId, paymentId, returnUrl: `${appOrigin()}/orders/${orderId}`, amountKgs: price, description: stream.title });
  await orderRef(orderId).update({ providerRef: session.providerRef, updatedAt: Timestamp.now() });
  return { orderId, redirectUrl: session.url };
}

/** Provider callbacks identify the payment by the id we sent, never by anything the buyer controls. */
export async function findOrderByPaymentId(paymentId: string): Promise<{ id: string; order: OrderDoc } | null> {
  const snap = await db.collection(COLLECTIONS.orders).where("paymentIds", "array-contains", paymentId).limit(1).get();
  const d = snap.docs[0];
  return d ? { id: d.id, order: d.data() as OrderDoc } : null;
}

export async function getOrder(acc: AccountContext, id: string) {
  return orderDto(id, await ownOrder(acc, id));
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
    label: `Билет ${acc.user.authEmail}`.slice(0, 80),
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
