import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { ApiError } from "@/lib/shared/errors";
import type { Actor } from "@/lib/shared/roles";
import { auditCreate } from "../audit";
import { SETTINGS } from "../config";
import { adminAuth, db, demoMode } from "../firebase-admin";
import { COOKIE } from "../http";
import { COLLECTIONS, SCHEMA_VERSION, type UserDoc } from "../schema";

export interface AccountContext {
  actor: Actor;
  user: UserDoc;
}

/**
 * Source of truth for every private request: verifies the Firebase session cookie
 * (with revocation check), then the *current* users document. Claims are never trusted.
 */
export const requireAccount = (req: NextRequest): Promise<AccountContext> =>
  requireAccountByCookie(req.cookies.get(COOKIE.account)?.value);

const DEMO_UID = "demo-user";

/** DEMO_MODE only: a fixed organizer account created on demand in the in-memory store. */
async function demoAccount(): Promise<AccountContext> {
  const userRef = db.collection(COLLECTIONS.users).doc(DEMO_UID);
  const usageRef = db.collection(COLLECTIONS.usage).doc(DEMO_UID);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(userRef)).exists) return;
    const now = Timestamp.now();
    const user: UserDoc = {
      schemaVersion: SCHEMA_VERSION,
      uid: DEMO_UID,
      authEmail: "demo@localhost.invalid",
      emailVerified: false,
      googleProviderUid: DEMO_UID,
      googleDisplayName: null,
      displayName: "Демо-режим",
      contactEmail: null,
      role: "USER",
      status: "ACTIVE",
      permissions: { canCreateStreams: true },
      limits: { maxActiveStreams: SETTINGS.defaultMaxActiveStreams, maxLinksLifetime: SETTINGS.defaultMaxLinksLifetime },
      accessUntil: null,
      authSyncStatus: "SYNCED",
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(userRef, user);
    tx.create(usageRef, { schemaVersion: SCHEMA_VERSION, issuedLifetime: 0, activeStreams: 0, updatedAt: now });
  });
  const user = (await userRef.get()).data() as UserDoc;
  return { actor: { uid: DEMO_UID, role: user.role, status: user.status }, user };
}

export async function requireAccountByCookie(cookie: string | undefined): Promise<AccountContext> {
  if (demoMode) return demoAccount();
  if (!cookie) throw new ApiError("AUTH_REQUIRED", "Требуется вход");

  let uid: string;
  try {
    uid = (await adminAuth.verifySessionCookie(cookie, true)).uid;
  } catch {
    throw new ApiError("SESSION_INVALID", "Сессия недействительна");
  }

  const snap = await db.collection(COLLECTIONS.users).doc(uid).get();
  const user = snap.data() as UserDoc | undefined;
  if (!user || user.status !== "ACTIVE") throw new ApiError("FORBIDDEN", "Аккаунт недоступен");
  if (user.accessUntil && user.accessUntil.toMillis() <= Date.now()) throw new ApiError("FORBIDDEN", "Срок доступа аккаунта истёк");
  // A guest (anonymous session) is a viewer only; organizers and admins must sign in with Google.
  if (user.guest && (user.role !== "USER" || user.permissions.canCreateStreams)) throw new ApiError("FORBIDDEN", "Требуется вход через Google");

  return { actor: { uid, role: user.role, status: user.status }, user };
}

/**
 * Verifies the Firebase ID token and returns a session cookie value + the stored user.
 * Google sign-in is the full account. An anonymous token only creates a view-only guest (tickets), never a role.
 */
export async function createAccountSession(idToken: string, requestId: string): Promise<{ cookie: string; user: UserDoc }> {
  if (demoMode) throw new ApiError("FORBIDDEN", "Вход отключён в демо-режиме");
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    throw new ApiError("SESSION_INVALID", "Недействительный токен входа");
  }
  const provider = decoded.firebase.sign_in_provider;
  if (provider === "anonymous") {
    const guest = await upsertGuest(decoded.uid, requestId);
    const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SETTINGS.accountSessionDays * 86_400_000 });
    return { cookie, user: guest };
  }
  if (provider !== "google.com") throw new ApiError("FORBIDDEN", "Недопустимый способ входа");
  if (Date.now() / 1000 - decoded.auth_time > SETTINGS.recentAuthSeconds) {
    throw new ApiError("SESSION_INVALID", "Требуется свежий вход");
  }
  if (!decoded.email) throw new ApiError("FORBIDDEN", "У аккаунта Google нет email");

  const user = await upsertUserOnLogin({
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified === true,
    googleUid: (decoded.firebase.identities?.["google.com"] as string[] | undefined)?.[0] ?? decoded.uid,
    displayName: (decoded.name as string | undefined) ?? null,
    photoUrl: safePhotoUrl(decoded.picture),
    requestId,
  });
  if (user.status !== "ACTIVE") throw new ApiError("FORBIDDEN", "Аккаунт заблокирован");

  const cookie = await adminAuth.createSessionCookie(idToken, { expiresIn: SETTINGS.accountSessionDays * 86_400_000 });
  return { cookie, user };
}

interface LoginInfo {
  uid: string;
  email: string;
  emailVerified: boolean;
  googleUid: string;
  displayName: string | null;
  photoUrl: string | null;
  requestId: string;
}

/** Only an https Google-hosted picture is stored: the value ends up in an img tag under our CSP. */
export function safePhotoUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.endsWith(".googleusercontent.com") ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Anonymous session: a view-only guest document, created once per uid. Role and permissions can never be elevated here. */
async function upsertGuest(uid: string, requestId: string): Promise<UserDoc> {
  const userRef = db.collection(COLLECTIONS.users).doc(uid);
  const usageRef = db.collection(COLLECTIONS.usage).doc(uid);
  return db.runTransaction(async (tx) => {
    const [snap, usageSnap] = await Promise.all([tx.get(userRef), tx.get(usageRef)]);
    if (snap.exists) {
      const u = snap.data() as UserDoc;
      if (u.status !== "ACTIVE") throw new ApiError("FORBIDDEN", "Аккаунт заблокирован");
      return u;
    }
    const now = Timestamp.now();
    const user: UserDoc = {
      schemaVersion: SCHEMA_VERSION,
      uid,
      authEmail: "",
      guest: true,
      emailVerified: false,
      googleProviderUid: "",
      googleDisplayName: null,
      displayName: "Гость",
      contactEmail: null,
      role: "USER",
      status: "ACTIVE",
      permissions: { canCreateStreams: false },
      limits: { maxActiveStreams: 0, maxLinksLifetime: 0 },
      accessUntil: null,
      authSyncStatus: "SYNCED",
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(userRef, user);
    if (!usageSnap.exists) tx.create(usageRef, { schemaVersion: SCHEMA_VERSION, issuedLifetime: 0, activeStreams: 0, updatedAt: now });
    auditCreate(
      tx,
      { eventId: randomUUID(), actorUid: uid, actorType: "GUEST", action: "GUEST_CREATED", targetType: "user", targetId: uid, requestId, after: { role: "USER", guest: true } },
      now,
    );
    return user;
  });
}

/** First login creates user + usage atomically with role USER; later logins never touch role, status or limits. */
async function upsertUserOnLogin(info: LoginInfo): Promise<UserDoc> {
  const userRef = db.collection(COLLECTIONS.users).doc(info.uid);
  const usageRef = db.collection(COLLECTIONS.usage).doc(info.uid);
  const eventId = randomUUID();

  return db.runTransaction(async (tx) => {
    const [userSnap, usageSnap] = await Promise.all([tx.get(userRef), tx.get(usageRef)]);
    const now = Timestamp.now();

    if (userSnap.exists) {
      const wasGuest = (userSnap.data() as UserDoc).guest === true;
      tx.update(userRef, {
        // A guest that linked Google keeps its uid (and tickets) and becomes a regular viewer.
        ...(wasGuest ? { guest: false, googleProviderUid: info.googleUid, displayName: (info.displayName ?? info.email).slice(0, 120) } : {}),
        authEmail: info.email,
        emailVerified: info.emailVerified,
        googleDisplayName: info.displayName,
        photoUrl: info.photoUrl,
        updatedAt: now,
      });
      return { ...(userSnap.data() as UserDoc), authEmail: info.email, emailVerified: info.emailVerified, photoUrl: info.photoUrl };
    }

    const user: UserDoc = {
      schemaVersion: SCHEMA_VERSION,
      uid: info.uid,
      authEmail: info.email,
      emailVerified: info.emailVerified,
      googleProviderUid: info.googleUid,
      googleDisplayName: info.displayName,
      photoUrl: info.photoUrl,
      displayName: (info.displayName ?? info.email).slice(0, 120),
      contactEmail: null,
      role: "USER",
      status: "ACTIVE",
      permissions: { canCreateStreams: false },
      limits: { maxActiveStreams: SETTINGS.defaultMaxActiveStreams, maxLinksLifetime: SETTINGS.defaultMaxLinksLifetime },
      accessUntil: null,
      authSyncStatus: "SYNCED",
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(userRef, user);
    if (!usageSnap.exists) {
      tx.create(usageRef, { schemaVersion: SCHEMA_VERSION, issuedLifetime: 0, activeStreams: 0, updatedAt: now });
    }
    auditCreate(
      tx,
      {
        eventId,
        actorUid: info.uid,
        actorType: "USER",
        action: "USER_CREATED",
        targetType: "user",
        targetId: info.uid,
        requestId: info.requestId,
        after: { role: "USER", status: "ACTIVE" },
      },
      now,
    );
    return user;
  });
}
