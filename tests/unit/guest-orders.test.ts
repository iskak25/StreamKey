import { beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

process.env.DEMO_MODE = "true";
process.env.PAYMENTS_PROVIDER = "mock";

type Orders = typeof import("@/lib/server/orders");
let o: Orders;
let db: typeof import("@/lib/server/firebase-admin").db;
let COLLECTIONS: typeof import("@/lib/server/schema").COLLECTIONS;

const guest = (uid: string) =>
  ({ actor: { uid, role: "USER", status: "ACTIVE" }, user: { uid, guest: true, authEmail: "", role: "USER", status: "ACTIVE", permissions: { canCreateStreams: false } } }) as never;

beforeAll(async () => {
  o = await import("@/lib/server/orders");
  ({ db } = await import("@/lib/server/firebase-admin"));
  ({ COLLECTIONS } = await import("@/lib/server/schema"));
  const now = Date.now();
  await db.collection(COLLECTIONS.streams).doc("c1").set({
    ownerUid: "org", title: "Концерт", publicationStatus: "published", priceKgs: 500,
    startsAt: Timestamp.fromMillis(now + 3_600_000), endsAt: Timestamp.fromMillis(now + 7_200_000),
    accessStartsAt: Timestamp.fromMillis(now), accessEndsAt: Timestamp.fromMillis(now + 7_200_000),
  });
});

describe("guest checkout", () => {
  it("creates a server-priced pending order and reuses it on a repeated click", async () => {
    const a = await o.startCheckout(guest("g1"), "c1", "r1");
    const b = await o.startCheckout(guest("g1"), "c1", "r2");
    expect(b.redirectUrl).toBe(a.redirectUrl);
    const order = (await db.collection(COLLECTIONS.orders).doc(a.orderId).get()).data() as { amountKgs: number; status: string; paymentIds: string[] };
    expect(order.amountKgs).toBe(500);
    expect(order.status).toBe("PENDING");
    expect(order.paymentIds).toHaveLength(1);
  });

  it("does not issue access before payment and rejects a wrong amount", async () => {
    const id = o.orderIdFor("c1", "g1");
    await expect(o.claimAccess(guest("g1"), id, "r")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(o.createRecoveryCode(guest("g1"), id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(o.markPaid(id, "t", 1, "r")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("hides orders from other buyers", async () => {
    await expect(o.getOrder(guest("g2"), o.orderIdFor("c1", "g1"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("marks paid once (idempotent webhook) and recovers the ticket with a single-use code", async () => {
    const id = o.orderIdFor("c1", "g1");
    await o.markPaid(id, "t", 500, "r");
    await o.markPaid(id, "t", 500, "r");
    const { code } = await o.createRecoveryCode(guest("g1"), id);

    await expect(o.recoverOrder(guest("g3"), "AAAA-AAAA-AAAA-AAAA", "r")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const moved = await o.recoverOrder(guest("g3"), code, "r");
    expect(moved.orderId).toBe(o.orderIdFor("c1", "g3"));
    expect((await o.getOrder(guest("g3"), moved.orderId)).paid).toBe(true);
    await expect(o.getOrder(guest("g1"), id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(o.recoverOrder(guest("g4"), code, "r")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
