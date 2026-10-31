/** Concert dates are entered and shown in Asia/Bishkek (UTC+6, no DST); storage and API use UTC instants. */
export const BISHKEK_TZ = "Asia/Bishkek";
const BISHKEK_OFFSET_MS = 6 * 3_600_000;

export type ConcertPhase = "soon" | "live" | "ended";
export type PublicationStatus = "draft" | "published" | "archived";

export const PHASE_LABEL: Record<ConcertPhase, string> = { soon: "Скоро", live: "В эфире", ended: "Завершён" };
export const PUBLICATION_LABEL: Record<PublicationStatus, string> = { draft: "Черновик", published: "Опубликован", archived: "В архиве" };

export const MAX_PRICE_KGS = 1_000_000;
export const MAX_CONCERT_MS = 7 * 86_400_000;

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** "YYYY-MM-DDTHH:mm" read as Bishkek wall-clock time -> UTC ISO string. Throws on malformed input. */
export function bishkekLocalToIso(local: string): string {
  const m = LOCAL.exec(local);
  if (!m) throw new Error("bad datetime");
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi) - BISHKEK_OFFSET_MS;
  if (Number.isNaN(ms)) throw new Error("bad datetime");
  return new Date(ms).toISOString();
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" in Bishkek time (value for <input type="datetime-local">). */
export function isoToBishkekLocal(iso: string): string {
  return new Date(Date.parse(iso) + BISHKEK_OFFSET_MS).toISOString().slice(0, 16);
}

const bishkekFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: BISHKEK_TZ,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatBishkek = (iso: string | null | undefined): string => (iso ? `${bishkekFmt.format(new Date(iso))} (Бишкек)` : "—");

export function formatPrice(priceKgs: number): string {
  return priceKgs === 0 ? "Бесплатно" : `${new Intl.NumberFormat("ru-RU").format(priceKgs)} сом`;
}

/**
 * Phase from the schedule only. This does NOT prove that YouTube is actually broadcasting.
 */
export function concertPhase(nowMs: number, startsAtMs: number, endsAtMs: number): ConcertPhase {
  if (nowMs < startsAtMs) return "soon";
  if (nowMs < endsAtMs) return "live";
  return "ended";
}
