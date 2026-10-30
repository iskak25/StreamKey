const fmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export const formatDate = (iso: string | null | undefined): string => (iso ? fmt.format(new Date(iso)) : "—");

/** `<input type="datetime-local">` value (local time) for a Date. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Local datetime-local value -> UTC ISO string for the API. */
export const localInputToIso = (v: string): string => new Date(v).toISOString();

export const STREAM_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Черновик", cls: "pill" },
  SCHEDULED: { label: "Запланирована", cls: "pill pill-warn" },
  LIVE: { label: "В эфире", cls: "pill pill-ok" },
  ENDED: { label: "Завершена", cls: "pill" },
  REVOKED: { label: "Доступ закрыт", cls: "pill pill-danger" },
  ARCHIVED: { label: "В архиве", cls: "pill" },
};

export const LINK_STATUS: Record<string, { label: string; cls: string }> = {
  ISSUED: { label: "Выдана", cls: "pill pill-warn" },
  ACTIVE: { label: "Активна", cls: "pill pill-ok" },
  REVOKED: { label: "Отозвана", cls: "pill pill-danger" },
  EXPIRED: { label: "Истекла", cls: "pill" },
};

const shortFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Compact date for table cells, e.g. 30.10.26, 23:09. */
export const formatShort = (iso: string | null | undefined): string => (iso ? shortFmt.format(new Date(iso)) : "—");
