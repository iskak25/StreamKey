import "server-only";
import { z } from "zod";
import { Timestamp } from "firebase-admin/firestore";

/**
 * Ð¡Ñ…ÐµÐ¼Ñ‹ ÐºÐ¾Ð»Ð»ÐµÐºÑ†Ð¸Ð¹ Firestore Ð´Ð»Ñ StreamKey (Ð¢Ð—, Ñ€Ð°Ð·Ð´ÐµÐ» 10).
 * Ð’ÑÐµ Ð´Ð°Ñ‚Ñ‹ â€” Firestore Timestamp (UTC). schemaVersion Ð¾Ð±ÑÐ·Ð°Ñ‚ÐµÐ»ÐµÐ½.
 * Ð¢Ð¾ÐºÐµÐ½ Ð¿Ñ€Ð¸Ð³Ð»Ð°ÑˆÐµÐ½Ð¸Ñ Ð¸ browser secret Ð² Ð±Ð°Ð·Ðµ ÐÐ• Ñ…Ñ€Ð°Ð½ÑÑ‚ÑÑ.
 */

export const SCHEMA_VERSION = 1 as const;

export const COLLECTIONS = {
  users: "users",
  streams: "streams",
  accessLinks: "access_links",
  sessions: "sessions",
  idempotency: "idempotency",
  usage: "usage",
  system: "system",
  auditLogs: "audit_logs",
  authJobs: "auth_jobs",
  rateBuckets: "rate_buckets",
  streamCovers: "stream_covers",
  orders: "orders",
} as const;

const ts = z.instanceof(Timestamp);
const tsNullable = ts.nullable();
const base = { schemaVersion: z.literal(SCHEMA_VERSION) };

export const Role = z.enum(["GUEST", "USER", "ADMIN", "SUPER_ADMIN"]);
export const UserStatus = z.enum(["ACTIVE", "BLOCKED", "DELETING"]);
export const AuthSyncStatus = z.enum(["SYNCED", "PENDING", "FAILED"]);
export const StreamStatus = z.enum(["DRAFT", "SCHEDULED", "LIVE", "ENDED", "REVOKED", "ARCHIVED"]);
/** EXPIRED Ð½Ðµ Ñ…Ñ€Ð°Ð½Ð¸Ñ‚ÑÑ: Ð²Ñ‹Ñ‡Ð¸ÑÐ»ÑÐµÑ‚ÑÑ ÐºÐ°Ðº now >= expiresAt (Ð¢Ð— 7.2). */
export const LinkStatus = z.enum(["ISSUED", "ACTIVE", "REVOKED"]);
export const SessionStatus = z.enum(["ACTIVE", "REVOKED"]);
export const JobStatus = z.enum(["PENDING", "RUNNING", "DONE", "FAILED"]);

/** Ð¡Ð¾ÑÑ‚Ð¾ÑÐ½Ð¸Ñ Ñ‚Ñ€Ð°Ð½ÑÐ»ÑÑ†Ð¸Ð¸, ÐºÐ¾Ñ‚Ð¾Ñ€Ñ‹Ðµ Ð·Ð°Ð½Ð¸Ð¼Ð°ÑŽÑ‚ ÐºÐ²Ð¾Ñ‚Ñƒ activeStreams (Ð¢Ð— 12.2). */
export const ACTIVE_STREAM_STATUSES = ["DRAFT", "SCHEDULED", "LIVE"] as const;

/** users/{uid} */
export const UserDoc = z.object({
  ...base,
  uid: z.string().min(1),
  /** Empty for a guest (anonymous Firebase session). */
  authEmail: z.string().email().or(z.literal("")),
  /** True while the account is an anonymous guest viewer; cleared when the guest links Google. */
  guest: z.boolean().optional(),
  emailVerified: z.boolean(),
  googleProviderUid: z.string(),
  googleDisplayName: z.string().nullable(),
  /** Google profile picture (https, googleusercontent.com only); null when the account has none. */
  photoUrl: z.string().max(500).nullable().optional(),
  displayName: z.string().max(120),
  contactEmail: z.string().email().nullable(),
  role: Role,
  status: UserStatus,
  permissions: z.object({ canCreateStreams: z.boolean() }),
  limits: z.object({
    maxActiveStreams: z.number().int().min(0),
    maxLinksLifetime: z.number().int().min(0),
  }),
  accessUntil: tsNullable,
  authSyncStatus: AuthSyncStatus,
  version: z.number().int().min(0),
  createdAt: ts,
  updatedAt: ts,
});

/** streams/{streamId} â€” streamId = auto ID */
export const StreamDoc = z.object({
  ...base,
  ownerUid: z.string().min(1),
  title: z.string().min(1).max(160),
  description: z.string().max(2000),
  youtubeVideoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  status: StreamStatus,
  accessStartsAt: ts,
  accessEndsAt: ts,
  accessVersion: z.number().int().min(0),
  hasIssuedLinks: z.boolean(),
  linksIssued: z.number().int().min(0).optional(), // absent on streams created before the counter existed
  // Concert catalog fields (admin-managed). Absent on plain organizer streams, which are never listed publicly.
  publicationStatus: z.enum(["draft", "published", "archived"]).optional(),
  priceKgs: z.number().int().min(0).optional(),
  startsAt: ts.optional(),
  endsAt: ts.optional(),
  coverPath: z.string().nullable().optional(),
  coverUpdatedAt: tsNullable.optional(),
  createdBy: z.string().optional(),
  version: z.number().int().min(0),
  createdAt: ts,
  updatedAt: ts,
  archivedAt: tsNullable,
});

/** access_links/{linkId} â€” linkId = base64url(SHA-256(token)) */
export const AccessLinkDoc = z.object({
  ...base,
  ownerUid: z.string().min(1),
  streamId: z.string().min(1),
  status: LinkStatus,
  label: z.string().max(120).nullable(),
  createdByUid: z.string().min(1),
  createdAt: ts,
  expiresAt: ts,
  activatedAt: tsNullable,
  activeSessionId: z.string().nullable(),
  sessionKeyVersion: z.number().int().nullable(),
  revokedAt: tsNullable,
  revokeReason: z.string().max(500).nullable(),
  replacedLinkId: z.string().nullable(),
  purgeAt: ts, // TTL: expiresAt + 90 ÑÑƒÑ‚Ð¾Ðº
});

/** sessions/{sessionId} â€” sessionId = HMAC-SHA256(Ksession, version||browserSecret||linkId) */
export const SessionDoc = z.object({
  ...base,
  linkId: z.string().min(1),
  streamId: z.string().min(1),
  ownerUid: z.string().min(1),
  keyVersion: z.number().int(),
  status: SessionStatus,
  streamAccessVersion: z.number().int().min(0),
  createdAt: ts,
  expiresAt: ts, // min(link.expiresAt, stream.accessEndsAt, activatedAt + 24Ñ‡)
  lastSeenAt: ts,
  revokedAt: tsNullable,
  purgeAt: ts, // TTL: expiresAt + 7 ÑÑƒÑ‚Ð¾Ðº
});

/** idempotency/{requestId} â€” requestId = hash(uid, route, Idempotency-Key) */
export const IdempotencyDoc = z.object({
  ...base,
  actorUid: z.string().min(1),
  route: z.string(),
  requestHash: z.string(),
  resourceId: z.string(),
  encryptedReceipt: z.string().nullable(), // AES-256-GCM, Ð½Ð¸ÐºÐ¾Ð³Ð´Ð° Ð½Ðµ Ð¾Ñ‚Ð´Ð°Ñ‘Ñ‚ÑÑ ÐºÐ»Ð¸ÐµÐ½Ñ‚Ñƒ
  receiptKeyVersion: z.number().int().nullable(),
  replayUntil: ts, // createdAt + 10 Ð¼Ð¸Ð½ÑƒÑ‚
  createdAt: ts,
  purgeAt: ts, // TTL: createdAt + 24 Ñ‡Ð°ÑÐ°
});

/** usage/{uid} */
export const UsageDoc = z.object({
  ...base,
  issuedLifetime: z.number().int().min(0),
  activeStreams: z.number().int().min(0),
  updatedAt: ts,
});

/** system/security */
export const SystemSecurityDoc = z.object({
  ...base,
  activeSuperAdminCount: z.number().int().min(0),
  version: z.number().int().min(0),
});

/** audit_logs/{eventId} */
export const AuditLogDoc = z.object({
  ...base,
  actorUid: z.string().nullable(),
  actorType: z.enum(["USER", "GUEST", "SYSTEM"]),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  timestamp: ts,
  requestId: z.string(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().max(500).nullable(),
  purgeAt: ts, // TTL: timestamp + 180 ÑÑƒÑ‚Ð¾Ðº
});

/** auth_jobs/{jobId} */
export const AuthJobDoc = z.object({
  ...base,
  targetUid: z.string().min(1),
  action: z.enum(["DISABLE", "ENABLE", "REVOKE_TOKENS", "DELETE"]),
  desiredVersion: z.number().int().min(0),
  status: JobStatus,
  attempts: z.number().int().min(0),
  nextAttemptAt: ts,
  createdAt: ts,
  purgeAt: ts.nullable(), // ÑÑ‚Ð°Ð²Ð¸Ñ‚ÑÑ Ð¿Ñ€Ð¸ Ð·Ð°Ð²ÐµÑ€ÑˆÐµÐ½Ð¸Ð¸: +30 ÑÑƒÑ‚Ð¾Ðº
});

/** Ð¡Ñ€Ð¾ÐºÐ¸ Ñ…Ñ€Ð°Ð½ÐµÐ½Ð¸Ñ Ð¿Ð¾ ÑƒÐ¼Ð¾Ð»Ñ‡Ð°Ð½Ð¸ÑŽ (Ð¢Ð— 15.2), Ð²Ñ‹Ð½Ð¾ÑÑÑ‚ÑÑ Ð² ÐºÐ¾Ð½Ñ„Ð¸Ð³. */
export const RETENTION = {
  sessionsAfterExpiryDays: 7,
  linksAfterExpiryDays: 90,
  idempotencyHours: 24,
  receiptReplayMinutes: 10,
  auditDays: 180,
  finishedJobsDays: 30,
} as const;

export type UserDoc = z.infer<typeof UserDoc>;
export type StreamDoc = z.infer<typeof StreamDoc>;
export type AccessLinkDoc = z.infer<typeof AccessLinkDoc>;
export type SessionDoc = z.infer<typeof SessionDoc>;
export type IdempotencyDoc = z.infer<typeof IdempotencyDoc>;
export type UsageDoc = z.infer<typeof UsageDoc>;
export type SystemSecurityDoc = z.infer<typeof SystemSecurityDoc>;
export type AuditLogDoc = z.infer<typeof AuditLogDoc>;
export type AuthJobDoc = z.infer<typeof AuthJobDoc>;


export const OrderStatus = z.enum(["PENDING", "PAID", "FAILED"]);

/** orders/{concertId}_{buyerUid}: one ticket per buyer per concert. */
export interface OrderDoc {
  schemaVersion: typeof SCHEMA_VERSION;
  concertId: string;
  ownerUid: string;
  buyerUid: string;
  amountKgs: number;
  status: z.infer<typeof OrderStatus>;
  provider: string;
  providerRef: string | null;
  /** Every payment id sent to the provider for this order (a retry creates a new one); the callback is matched by it. */
  paymentIds: string[];
  paidAt: Timestamp | null;
  /** Current access link issued for this ticket, and how many times a link was issued. */
  linkId: string | null;
  claims: number;
  /** sha256 of the ticket recovery code (the code itself is shown once and never stored). */
  recoveryHash?: string | null;
  /** Provider payment page of the current pending attempt; reused on a repeated click. Visible to the buyer only. */
  paymentUrl?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
