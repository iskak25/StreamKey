/**
 * Одноразовое создание первого SUPER_ADMIN (ТЗ 4.4).
 *
 * Запуск (после первого Google-входа нужного аккаунта, чтобы UID существовал):
 *   BOOTSTRAP_ALLOWED=1 npx tsx scripts/bootstrap-super-admin.ts <FIREBASE_UID>
 *
 * Команда отказывается работать, если в system/security уже есть активный SUPER_ADMIN.
 * После успешного запуска уберите BOOTSTRAP_ALLOWED из окружения.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { randomUUID } from "node:crypto";

async function main() {
  if (process.env.BOOTSTRAP_ALLOWED !== "1") throw new Error("Set BOOTSTRAP_ALLOWED=1 to run bootstrap.");
  const uid = process.argv[2];
  if (!uid) throw new Error("Usage: bootstrap-super-admin.ts <FIREBASE_UID>");

  initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  const db = getFirestore();
  const authUser = await getAuth().getUser(uid); // проверка, что UID реален

  const eventId = randomUUID();
  const requestId = randomUUID();

  await db.runTransaction(async (tx) => {
    const secRef = db.doc("system/security");
    const userRef = db.doc(`users/${uid}`);
    const [sec, user] = await Promise.all([tx.get(secRef), tx.get(userRef)]);

    if (sec.exists && (sec.data()?.activeSuperAdminCount ?? 0) > 0) {
      throw new Error("SUPER_ADMIN already exists — bootstrap is disabled.");
    }
    if (!user.exists) throw new Error("users/{uid} not found: sign in with Google once first.");

    const now = Timestamp.now();
    const before = { role: user.get("role"), status: user.get("status") };

    tx.set(secRef, {
      schemaVersion: 1,
      activeSuperAdminCount: 1,
      version: (sec.data()?.version ?? 0) + 1,
    });
    tx.update(userRef, {
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      "permissions.canCreateStreams": true,
      version: FieldValue.increment(1),
      updatedAt: now,
    });
    tx.create(db.doc(`audit_logs/${eventId}`), {
      schemaVersion: 1,
      actorUid: null,
      actorType: "SYSTEM",
      action: "BOOTSTRAP_SUPER_ADMIN",
      targetType: "user",
      targetId: uid,
      timestamp: now,
      requestId,
      before,
      after: { role: "SUPER_ADMIN", status: "ACTIVE" },
      reason: `bootstrap for ${authUser.email ?? uid}`,
      purgeAt: Timestamp.fromMillis(now.toMillis() + 180 * 86400_000),
    });
  });

  console.log(`OK: ${uid} is SUPER_ADMIN. Remove BOOTSTRAP_ALLOWED now.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
