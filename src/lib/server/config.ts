import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function key32(name: string): Buffer {
  const b = Buffer.from(required(name), "base64");
  if (b.length !== 32) throw new Error(`${name} must be 32 bytes (base64)`);
  return b;
}

export const appOrigin = (): string => required("APP_ORIGIN").replace(/\/$/, "");

export const sessionKeyVersion = (): number => Number(process.env.SESSION_HMAC_CURRENT_VERSION ?? 1);
export const sessionKey = (version: number): Buffer => key32(`SESSION_HMAC_KEY_V${version}`);

export const receiptKeyVersion = (): number => Number(process.env.RECEIPT_AES_CURRENT_VERSION ?? 1);
export const receiptKey = (version: number): Buffer => key32(`RECEIPT_AES_KEY_V${version}`);

export const csrfSecret = (): Buffer => key32("CSRF_SECRET");

export const activationsDisabled = (): boolean => process.env.ACTIVATIONS_DISABLED === "true";
export const youtubePlaybackEnabled = (): boolean => process.env.YOUTUBE_PLAYBACK_ENABLED === "true";

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
