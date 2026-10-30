export class ApiFail extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

interface Options {
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  csrf?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Thin fetch wrapper: same-origin cookies, JSON, error code extraction. Network failure => status 0. */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.csrf) headers["x-csrf-token"] = opts.csrf;

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiFail(0, "NETWORK");
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data as { error?: { code?: string } } | null)?.error?.code ?? "UNKNOWN";
    throw new ApiFail(res.status, code);
  }
  return data as T;
}

/** Prepares the browser binding and returns a CSRF token. Never touches an invitation. */
export async function prepareViewer(): Promise<string> {
  const { csrfToken } = await api<{ csrfToken: string }>("/viewer/context", { method: "POST" });
  return csrfToken;
}

const MESSAGES: Record<string, string> = {
  LINK_UNAVAILABLE: "Ссылка недоступна. Проверьте, что вы открыли её полностью.",
  LINK_ALREADY_USED: "Ссылка уже активирована в другом браузере.",
  ACCESS_REVOKED: "Доступ по этой ссылке закрыт организатором.",
  ACCESS_EXPIRED: "Срок действия ссылки или трансляции истёк.",
  ACCESS_NOT_STARTED: "Трансляция ещё не началась. Вернитесь ближе к началу.",
  OWNER_BLOCKED: "Доступ временно приостановлен. Обратитесь к организатору.",
  RATE_LIMITED: "Слишком много попыток. Подождите минуту и повторите.",
  TEMPORARY_UNAVAILABLE: "Сервис временно недоступен. Повторите попытку.",
  NETWORK: "Нет связи с сервером. Проверьте интернет и повторите.",
  COOKIES: "Браузер не сохраняет cookies. Включите их и повторите: доступ закрепляется за браузером.",
  FORBIDDEN: "Доступ не подтверждён. Если вы уже активировали ссылку в этом браузере, не очищайте cookies; при их потере обратитесь к организатору за новой ссылкой.",
  QUOTA_EXCEEDED: "Достигнут лимит. Обратитесь к администратору, если нужен больший.",
  VALIDATION_ERROR: "Проверьте введённые данные.",
  VERSION_CONFLICT: "Данные были изменены в другом окне. Обновите страницу.",
  IDEMPOTENCY_CONFLICT: "Запрос уже выполнялся с другими данными. Обновите страницу и повторите.",
  NOT_FOUND: "Не найдено.",
  SESSION_INVALID: "Сессия истекла. Войдите снова.",
  AUTH_REQUIRED: "Требуется вход.",
};

export const messageFor = (code: string): string => MESSAGES[code] ?? "Не удалось выполнить действие. Повторите попытку.";

/** Organizer-side wording: FORBIDDEN here is about rights, not about cookies. */
export const organizerMessage = (code: string): string =>
  code === "FORBIDDEN" ? "Недостаточно прав или аккаунт ограничен." : messageFor(code);

export const isAuthError = (e: unknown): boolean => e instanceof ApiFail && (e.code === "AUTH_REQUIRED" || e.code === "SESSION_INVALID");

export const errCode = (e: unknown): string => (e instanceof ApiFail ? e.code : "UNKNOWN");
