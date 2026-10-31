import "server-only";

/**
 * Concerts that anyone can watch on their public page, with no ticket, sign-in, token or device check.
 * This is an explicit, per-concert exception: every other concert keeps the full ticket and link protection.
 * Extra ids can be added with PUBLIC_VIEWING_CONCERT_IDS (comma separated) without a code change.
 */
const BUILT_IN = ["LwVp0xDPFjvfXFCGJOan"];

export const isPublicViewing = (concertId: string): boolean =>
  BUILT_IN.includes(concertId) ||
  (process.env.PUBLIC_VIEWING_CONCERT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(concertId);
