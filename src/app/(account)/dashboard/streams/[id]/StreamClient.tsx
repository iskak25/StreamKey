"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import { formatDate, formatShort, LINK_STATUS, localInputToIso, STREAM_STATUS, toLocalInput } from "@/lib/client/format";
import IssuedKeyDialog from "./IssuedKeyDialog";

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
interface IssueResponse {
  linkId: string;
  url: string | null;
  expiresAt: string;
  secretAvailable: boolean;
}
/** The only place the full secret URL exists in the UI. Cleared when the dialog closes or the page unmounts. */
interface Issued {
  url: string;
  label: string | null;
}
type Confirm = { kind: "revoke-link" | "replace-link"; id: string } | { kind: "revoke-stream" | "archive" } | null;

const CLOSED = new Set(["REVOKED", "ARCHIVED", "ENDED"]);
// Network-ish failures keep the Idempotency-Key so a retry cannot create a second link.
const RETRYABLE = new Set(["NETWORK", "TEMPORARY_UNAVAILABLE"]);

function ConfirmButtons({ onYes, label, busy, onCancel, small }: { onYes: () => void; label: string; busy: boolean; onCancel: () => void; small?: boolean }) {
  const sm = small ? " btn-sm" : "";
  return (
    <span className="actions">
      <button className={`btn btn-danger${sm}`} type="button" onClick={onYes} disabled={busy}>
        {label}
      </button>
      <button className={`btn btn-ghost${sm}`} type="button" onClick={onCancel}>
        Отмена
      </button>
    </span>
  );
}

export default function StreamClient({ id }: { id: string }) {
  const router = useRouter();
  const [stream, setStream] = useState<Stream | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const idemKey = useRef<string | null>(null);
  const lock = useRef(false); // synchronous guard: state updates lag behind a fast double click

  // The secret must not outlive the page.
  useEffect(() => () => setIssued(null), []);

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

  /** One mutating call at a time, fresh CSRF token each time, uniform busy/error handling. */
  async function mutate<T>(fn: (csrf: string) => Promise<T>, keepKeyOn: ReadonlySet<string> = new Set()): Promise<T | null> {
    if (lock.current) return null;
    lock.current = true;
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
      lock.current = false;
      setBusy(false);
      setConfirm(null);
    }
  }

  function showResult(r: IssueResponse, label: string | null) {
    if (r.url) setIssued({ url: r.url, label });
    else setInfo("Эта ссылка уже была создана тем же запросом, но её текст больше недоступен. Отзовите её и сгенерируйте новую.");
  }

  async function generate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const label = String(f.get("label") ?? "").trim();
    const key = (idemKey.current ??= crypto.randomUUID());
    const r = await mutate(
      (csrf) =>
        api<IssueResponse>(`/streams/${id}/links`, {
          method: "POST",
          csrf,
          headers: { "idempotency-key": key },
          body: { label: label || undefined, expiresAt: localInputToIso(String(f.get("expires"))) },
        }),
      RETRYABLE,
    );
    if (r) {
      form.reset();
      showResult(r, label || null);
      await load();
    }
  }

  async function replaceLink(l: LinkItem) {
    if (!stream) return;
    const key = (idemKey.current ??= crypto.randomUUID());
    const r = await mutate(
      (csrf) =>
        api<IssueResponse>(`/links/${l.linkId}/replace`, {
          method: "POST",
          csrf,
          headers: { "idempotency-key": key },
          body: { label: l.label ?? undefined, expiresAt: stream.accessEndsAt, reason: "Перевыпуск организатором" },
        }),
      RETRYABLE,
    );
    if (r) {
      showResult(r, l.label);
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
  const cancel = () => setConfirm(null);

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
              <ConfirmButtons label="Да, закрыть доступ всем" onYes={() => closeStream("revoke")} busy={busy} onCancel={cancel} />
            ) : (
              <button className="btn btn-danger" type="button" onClick={() => setConfirm({ kind: "revoke-stream" })}>
                Закрыть доступ
              </button>
            ))}
          {stream.status !== "ARCHIVED" &&
            (confirm?.kind === "archive" ? (
              <ConfirmButtons label="Да, архивировать" onYes={() => closeStream("archive")} busy={busy} onCancel={cancel} />
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

      {!closed && (
        <form className="card stack" onSubmit={generate} onChange={() => (idemKey.current = null)}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="label">Метка (необязательно)</label>
              <input id="label" name="label" maxLength={120} placeholder="Например: Айдар" />
            </div>
            <div className="field">
              <label htmlFor="expires">Ссылка действует до</label>
              <input id="expires" name="expires" type="datetime-local" required defaultValue={toLocalInput(new Date(stream.accessEndsAt))} />
            </div>
          </div>
          <span className="hint">
            Метка видна только вам и не подтверждает личность. Один ключ — один зритель: ссылка привяжется к браузеру, в котором её откроют первым.
          </span>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Генерируем…" : "Сгенерировать новый ключ"}
          </button>
        </form>
      )}

      <section className="stack">
        <h2>Ссылки</h2>
        {links.length === 0 ? (
          <p className="muted">Ссылок пока нет.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Метка</th>
                  <th scope="col">Создана</th>
                  <th scope="col">Действует до</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Активирована</th>
                  <th scope="col">Действия</th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => {
                  const ls = LINK_STATUS[l.status] ?? { label: l.status, cls: "pill" };
                  const live = l.status === "ISSUED" || l.status === "ACTIVE";
                  const asking = confirm && "id" in confirm && confirm.id === l.linkId ? confirm.kind : null;
                  return (
                    <tr key={l.linkId}>
                      <td>{l.label ?? <span className="muted">Без метки</span>}</td>
                      <td className="nowrap">{formatShort(l.createdAt)}</td>
                      <td className="nowrap">{formatShort(l.expiresAt)}</td>
                      <td>
                        <span className={ls.cls}>{ls.label}</span>
                      </td>
                      <td className="nowrap">{formatShort(l.activatedAt)}</td>
                      <td>
                        {live && !closed ? (
                          asking === "revoke-link" ? (
                            <ConfirmButtons small label="Да, отозвать" onYes={() => revokeLink(l)} busy={busy} onCancel={cancel} />
                          ) : asking === "replace-link" ? (
                            <ConfirmButtons small label="Да, перевыпустить" onYes={() => replaceLink(l)} busy={busy} onCancel={cancel} />
                          ) : (
                            <span className="actions">
                              <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirm({ kind: "revoke-link", id: l.linkId })}>
                                Отозвать
                              </button>
                              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirm({ kind: "replace-link", id: l.linkId })}>
                                Перевыпустить
                              </button>
                            </span>
                          )
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">
          Полный ключ показывается один раз при создании. Если его нужно отправить ещё раз, отзовите старую ссылку и сгенерируйте новую (или нажмите
          «Перевыпустить»: старая отзовётся сразу).
        </p>
        {cursor && (
          <button className="btn btn-ghost" type="button" onClick={() => loadLinks(cursor).catch(fail)}>
            Показать ещё
          </button>
        )}
      </section>

      {issued && <IssuedKeyDialog url={issued.url} label={issued.label} onClose={() => setIssued(null)} />}
    </div>
  );
}
