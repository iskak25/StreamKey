import "server-only";
import { getApps, initializeApp, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createMemoryDb } from "./dev/memory-db";

/**
 * Единая инициализация Admin SDK. Только серверный код.
 * В эмуляторе достаточно FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST.
 * В Vercel ключ сервисного аккаунта передаётся через секреты окружения.
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

// DEMO_MODE swaps Firestore for an in-memory store and skips sign-in. It must never reach production.
if (process.env.DEMO_MODE === "true" && process.env.NODE_ENV === "production") {
  throw new Error("DEMO_MODE must not be enabled in production");
}
export const demoMode = process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";

const app = createApp();

export const db: Firestore = demoMode ? (createMemoryDb() as unknown as Firestore) : getFirestore(app);

export const adminAuth = getAuth(app);
