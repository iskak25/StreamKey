import "server-only";
import { getApps, initializeApp, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Auth } from "firebase-admin/auth";
import { demoMode } from "./config";
import { createMemoryDb } from "./dev/memory-db";

export { demoMode };

/**
 * Единая инициализация Admin SDK. Только серверный код.
 * В демо-режиме (ADR-0002) Firebase не инициализируется вообще: данные в памяти, входа нет.
 */
function createApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  }
  return initializeApp({ credential: applicationDefault(), projectId });
}

const app = demoMode ? null : createApp();

export const db: Firestore = demoMode || !app ? (createMemoryDb() as unknown as Firestore) : getFirestore(app);

/**
 * Never touched in demo mode: every caller is guarded by `demoMode`. Loaded through a runtime-only require because
 * importing firebase-admin/auth crashes on Vercel's Node (jwks-rsa -> ESM-only jose) and the bundler hoists imports.
 */
export const adminAuth: Auth = demoMode || !app ? (null as unknown as Auth) : loadAuth(app);

function loadAuth(a: App): Auth {
  const mod = "firebase-admin/auth"; // variable name: keeps the bundler from resolving it statically
  return (createRequire(join(process.cwd(), "noop.js"))(mod) as typeof import("firebase-admin/auth")).getAuth(a);
}
