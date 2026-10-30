import "server-only";
import { createHash } from "node:crypto";

/**
 * Demo mode = in-memory store + no sign-in (see ADR-0002). On when DEMO_MODE=true, or when no
 * Firebase credentials are configured at all (unless DEMO_MODE=false forces the real backend).
 */
export const demoMode: boolean =
  process.env.DEMO_MODE === "true" ||
  (process.env.DEMO_MODE !== "false" &&
    !process.env.FIREBASE_CLIENT_EMAIL &&
    !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    !process.env.FIRESTORE_EMULATOR_HOST);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function key32(name: string): Buffer {
  const v = process.env[name];
  // Demo only: a fixed, PUBLIC derivation keeps serverless instances consistent without any setup.
  // It protects nothing; real deployments must set real secrets.
  if (!v && demoMode) return createHash("sha256").update(`streamkey-demo:${name}`).digest();
  const b = Buffer.from(required(name), "base64");
  if (b.length !== 32) throw new Error(`${name} must be 32 bytes (base64)`);
  return b;
}

export const appOrigin = (): string => {
  const v = process.env.APP_ORIGIN;
  if (v) return v.replace(/\/$/, "");
  if (demoMode) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    return host ? `https://${host}` : "http://localhost:3000";
  }
  return required("APP_ORIGIN");
};

export const sessionKeyVersion = (): number => Number(process.env.SESSION_HMAC_CURRENT_VERSION ?? 1);
export const sessionKey = (version: number): Buffer => key32(`SESSION_HMAC_KEY_V${version}`);

export const receiptKeyVersion = (): number => Number(process.env.RECEIPT_AES_CURRENT_VERSION ?? 1);
export const receiptKey = (version: number): Buffer => key32(`RECEIPT_AES_KEY_V${version}`);

export const csrfSecret = (): Buffer => key32("CSRF_SECRET");

export const activationsDisabled = (): boolean => process.env.ACTIVATIONS_DISABLED === "true";
// Owner enabled real YouTube playback (ADR-0001). Demo mode: on unless explicitly "false"; real mode: opt-in.
export const youtubePlaybackEnabled = (): boolean =>
  process.env.YOUTUBE_PLAYBACK_ENABLED === "true" || (demoMode && process.env.YOUTUBE_PLAYBACK_ENABLED !== "false");

/** Defaults from the spec; meant to be overridable via admin settings later. */
export const SETTINGS = {
  accountSessionDays: 5,
  recentAuthSeconds: 5 * 60,
  maxBodyBytes: 16 * 1024,
  maxWindowDays: 7,
  guestSessionMaxHours: 24,
  viewerCookieDays: 30,
  leaseSeconds: 90,
  seenIntervalSeconds: 5 * 60,
  receiptReplayMinutes: 10,
  defaultMaxActiveStreams: 5,
  defaultMaxLinksLifetime: 500,
  rate: {
    createLinkPerMinute: 10,
    activatePerMinute: 10,
  },
} as const;
