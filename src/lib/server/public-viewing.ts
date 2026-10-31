import "server-only";

/**
 * Concerts that anyone can watch on their public page, with no ticket, sign-in, token or device check.
 * This is an explicit, per-concert exception: every other concert keeps the full ticket and link protection.
 * Extra ids can be added with PUBLIC_VIEWING_CONCERT_IDS (comma separated) without a code change.
 */
const BUILT_IN = ["LwVp0xDPFjvfXFCGJOan"];

/**
 * YouTube video of a public-viewing concert, known to the owner. Used when the database has no video for it or cannot be
 * reached, so the open page keeps working. The database value wins whenever it is available.
 */
const FALLBACK_VIDEO: Record<string, string> = { LwVp0xDPFjvfXFCGJOan: "5f-B6kbTsA4" };

export const fallbackVideoId = (concertId: string): string | null => FALLBACK_VIDEO[concertId] ?? null;

export const isPublicViewing = (concertId: string): boolean =>
  BUILT_IN.includes(concertId) ||
  (process.env.PUBLIC_VIEWING_CONCERT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(concertId);
