"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import { formatDate, LINK_STATUS, localInputToIso, STREAM_STATUS, toLocalInput } from "@/lib/client/format";

interface Stream {
  id: string;
  title: string;
  description: string;
  status: string;
  accessStartsAt: string;
  accessEndsAt: string;
  hasIssuedLinks: boolean;
  version: number;
}
interface LinkItem {
  linkId: string;
  status: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  activatedAt: string | null;
}
interface Issued {
  linkId: string;
  url: string | null;
  expiresAt: string;
  secretAvailable: boolean;
  label: string | null;
}
type Confirm = { kind: "revoke-link" | "replace-link"; id: string } | { kind: "revoke-stream" | "archive" } | null;

const CLOSED = new Set(["REVOKED", "ARCHIVED", "ENDED"]);
// Network-ish failures keep the Idempotency-Key so a retry cannot create a second link.
const RETRYABLE = new Set(["NETWORK", "TEMPORARY_UNAVAILABLE"]);

export default function StreamClient({ id }: { id: string }) {
  const router = useRouter();
  const [stream, setStream] = useState<Stream | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const idemKey = useRef<string | null>(null);

  const fail = useCallback(
    (e: unknown) => {
      if (isAuthError(e)) router.replace("/login");
      else setError(organizerMessage(errCode(e)));
    },
    [router],
  );

  const loadLinks = useCallback(
    async (after: string | null) => {
      const q = new URLSearchParams({ limit: "25" });
      if (after) q.set("cursor", after);
      const page = await api<{ items: LinkItem[]; nextCursor: string | null }>(`/streams/${id}/links?${q}`);
      setLinks((prev) => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    },
    [id],
  );

  const load = useCallback(async () => {
    try {
      setStream(await api<Stream>(`/streams/${id}`));
      await loadLinks(null);
    } catch (e) {
      fail(e);
    }
  }, [id, loadLinks, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Runs a mutating call with a fresh CSRF token; one place for busy/error handling. */
  async function mutate<T>(fn: (csrf: string) => Promise<T>, keepKeyOn: ReadonlySet<string> = new Set()): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      const result = await fn(csrfToken);
      idemKey.current = null;
      return result;
    } catch (e) {
      if (!keepKeyOn.has(errCode(e))) idemKey.current = null;
      fail(e);
      return null;
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function createLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const label = String(f.get("label") ?? "").trim();
    idemKey.current ??= crypto.randomUUID();
    const key = idemKey.current;
    const r = await mutate(
      (csrf) =>
        api<{ linkId: string; url: string | null; expiresAt: string; secretAvailable: boolean }>(`/streams/${id}/links`, {
          method: "POST",
          csrf,
          headers: { "idempotency-key": key },
          body: { label: label || undefined, expiresAt: localInputToIso(String(f.get("expires"))) },
        }),
      RETRYABLE,
    );
    if (r) {
      setIssued({ ...r, label: label || null });
      setCopied(false);
      (e.target as HTMLFormElement).reset?.();
      await load();
    }
  }

  async function replaceLink(l: LinkItem) {
    if (!stream) return;
    const key = (idemKey.current ??= crypto.randomUUID());
    const r = await mutate(
      (csrf) =>
        api<{ linkId: string; url: string | null; expiresAt: string; secretAvailable: boolean }>(`/links/${l.linkId}/replace`, {
          method: "POST",
          csrf,
          headers: { "idempotency-key": key },
          body: { label: l.label ?? undefined, expiresAt: stream.accessEndsAt, reason: "Перевыпуск организатором" },
        }),
      RETRYABLE,
    );
    if (r) {
      setIssued({ ...r, label: l.label });
      setCopied(false);
      await load();
    }
  }

  async function revokeLink(l: LinkItem) {
    const r = await mutate((csrf) => api(`/links/${l.linkId}/revoke`, { method: "POST", csrf, body: { reason: "Отозвано организатором" } }));
    if (r) {
      setInfo("Ссылка отозвана. Новых просмотров по ней не будет; уже полученная прямая ссылка YouTube не отзывается.");
      await load();
    }
  }

  async function closeStream(kind: "revoke" | "archive") {
    const r = await mutate((csrf) => api(`/streams/${id}/${kind}`, { method: "POST", csrf }));
    if (r) {
      setInfo(
        kind === "revoke"
          ? "Доступ к трансляции закрыт для всех ссылок. Уже полученная прямая ссылка YouTube не отзывается."
          : "Трансляция в архиве.",
      );
      await load();
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать автоматически: выделите ссылку и скопируйте вручную.");
    }
  }

  if (!stream) {
    return error ? (
      <p className="notice notice-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="muted">Загрузка…</p>
    );
  }

  const st = STREAM_STATUS[stream.status] ?? { label: stream.status, cls: "pill" };
  const closed = CLOSED.has(stream.status);

  const ConfirmButtons = ({ onYes, label }: { onYes: () => void; label: string }) => (
    <span className="actions">
      <button className="btn btn-danger" type="button" onClick={onYes} disabled={busy}>
        {label}
      </button>
      <button className="btn btn-ghost" type="button" onClick={() => setConfirm(null)}>
        Отмена
      </button>
    </span>
  );

  return (
    <div className="stack">
      <Link href="/dashboard">← Все трансляции</Link>

      <div className="card stack">
        <div className="row">
          <h1>{stream.title}</h1>
          <span className={st.cls}>{st.label}</span>
        </div>
        {stream.description && <p>{stream.description}</p>}
        <p className="muted">
          Доступ: {formatDate(stream.accessStartsAt)} — {formatDate(stream.accessEndsAt)}
        </p>
        <p className="notice">
          Ссылка ограничивает доступ к странице. YouTube Unlisted не защищает исходное видео от копирования и пересылки.
        </p>
        <div className="actions">
          <Link href={`/dashboard/streams/${id}/preview`} className="btn btn-ghost link-reset" role="button">
            Предпросмотр
          </Link>
          {!closed &&
            (confirm?.kind === "revoke-stream" ? (
              <ConfirmButtons label="Да, закрыть доступ всем" onYes={() => closeStream("revoke")} />
            ) : (
              <button className="btn btn-danger" type="button" onClick={() => setConfirm({ kind: "revoke-stream" })}>
                Закрыть доступ
              </button>
            ))}
          {stream.status !== "ARCHIVED" &&
            (confirm?.kind === "archive" ? (
              <ConfirmButtons label="Да, архивировать" onYes={() => closeStream("archive")} />
            ) : (
              <button className="btn btn-ghost" type="button" onClick={() => setConfirm({ kind: "archive" })}>
                В архив
              </button>
            ))}
        </div>
        {confirm?.kind === "revoke-stream" && (
          <p className="hint">Все ссылки этой трансляции перестанут открывать просмотр. Это нельзя отменить: для возобновления нужна новая трансляция.</p>
        )}
      </div>

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="notice notice-ok" role="status">
          {info}
        </p>
      )}

      {issued && (
        <div className="card stack">
          <div className="row">
            <h2>{issued.label ?? "Новая ссылка"}</h2>
            <span className="pill pill-warn">Выдана</span>
          </div>
          {issued.url ? (
            <>
              <div className="url-box">{issued.url}</div>
              <button className="btn btn-block" type="button" onClick={() => copy(issued.url as string)}>
                {copied ? "Скопировано" : "Копировать ссылку"}
              </button>
              <p className="hint">Полная ссылка показывается только сейчас и нигде больше не сохраняется. Отправьте её одному получателю.</p>
            </>
          ) : (
            <p className="notice">
              Эта ссылка уже была создана этим запросом, но её текст больше недоступен. Отзовите её и создайте новую.
            </p>
          )}
        </div>
      )}

      {!closed && (
        <form className="card stack" onSubmit={createLink} onChange={() => (idemKey.current = null)}>
          <h2>Создать ссылку</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="label">Метка (необязательно)</label>
              <input id="label" name="label" maxLength={120} placeholder="Например: Айдар" />
              <span className="hint">Метка видна только вам и не подтверждает личность получателя.</span>
            </div>
            <div className="field">
              <label htmlFor="expires">Ссылка действует до</label>
              <input id="expires" name="expires" type="datetime-local" required defaultValue={toLocalInput(new Date(stream.accessEndsAt))} />
            </div>
          </div>
          <p className="hint">Одно нажатие — одна ссылка для одного человека. Она привяжется к браузеру, в котором её откроют первым.</p>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Создаём…" : "Создать ссылку"}
          </button>
        </form>
      )}

      <section className="stack">
        <h2>Ссылки</h2>
        {links.length === 0 && <p className="muted">Ссылок пока нет.</p>}
        <ul className="list">
          {links.map((l) => {
            const ls = LINK_STATUS[l.status] ?? { label: l.status, cls: "pill" };
            const live = l.status === "ISSUED" || l.status === "ACTIVE";
            return (
              <li key={l.linkId} className="list-item stack">
                <div className="row">
                  <strong>{l.label ?? `Ссылка ${l.linkId.slice(0, 6)}`}</strong>
                  <span className={ls.cls}>{ls.label}</span>
                </div>
                <p className="muted">
                  Создана {formatDate(l.createdAt)} · действует до {formatDate(l.expiresAt)}
                  {l.activatedAt && ` · активирована ${formatDate(l.activatedAt)}`}
                </p>
                {live && !closed && (
                  <div className="actions">
                    {confirm?.kind === "revoke-link" && confirm.id === l.linkId ? (
                      <ConfirmButtons label="Да, отозвать" onYes={() => revokeLink(l)} />
                    ) : (
                      <button className="btn btn-danger" type="button" onClick={() => setConfirm({ kind: "revoke-link", id: l.linkId })}>
                        Отозвать
                      </button>
                    )}
                    {confirm?.kind === "replace-link" && confirm.id === l.linkId ? (
                      <ConfirmButtons label="Да, перевыпустить (старая отзовётся)" onYes={() => replaceLink(l)} />
                    ) : (
                      <button className="btn btn-ghost" type="button" onClick={() => setConfirm({ kind: "replace-link", id: l.linkId })}>
                        Перевыпустить
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {cursor && (
          <button className="btn btn-ghost" type="button" onClick={() => loadLinks(cursor).catch(fail)}>
            Показать ещё
          </button>
        )}
      </section>
    </div>
  );
}
