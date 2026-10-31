/** Post-login return path: only our own concert, order, tickets and profile pages, never an arbitrary URL. */
const ALLOWED = /^(\/(concerts|orders)\/[A-Za-z0-9_-]{1,160}(\?buy=1)?|\/tickets|\/profile)$/;

export function safeNext(value: string | string[] | undefined | null): string | null {
  return typeof value === "string" && ALLOWED.test(value) ? value : null;
}
