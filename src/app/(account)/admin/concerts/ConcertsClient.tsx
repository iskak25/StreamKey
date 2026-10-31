"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import { formatBishkek, formatPrice, PUBLICATION_LABEL, type PublicationStatus } from "@/lib/shared/concerts";

interface Concert {
  id: string;
  title: string;
  priceKgs: number;
  startsAt: string;
  endsAt: string;
  publicationStatus: PublicationStatus;
}

const PUB_CLASS: Record<PublicationStatus, string> = { draft: "pill", published: "pill pill-ok", archived: "pill pill-danger" };

export default function ConcertsClient() {
  const router = useRouter();
  const [items, setItems] = useState<Concert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const lock = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Concert[] }>("/admin/concerts");
      setItems(r.items);
    } catch (e) {
      if (isAuthError(e)) router.replace("/login");
      else if (errCode(e) === "FORBIDDEN") router.replace("/dashboard");
      else setError(organizerMessage(errCode(e)));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, path: string, body?: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusyId(id);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      await api(`/admin/concerts/${id}${path}`, { method: "POST", csrf: csrfToken, body: body ?? {} });
      setConfirmArchive(null);
      await load();
    } catch (e) {
      if (isAuthError(e)) router.replace("/login");
      else setError(organizerMessage(errCode(e)));
    } finally {
      lock.current = false;
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <h1>Управление трансляциями</h1>
        <Link href="/admin/concerts/new" className="btn link-reset" role="button">
          Новый концерт
        </Link>
      </div>
      <p className="muted">Опубликованные концерты видны на главной странице. Время показывается по Бишкеку.</p>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {items === null && !error && <p className="muted">Загрузка…</p>}
      {items?.length === 0 && (
        <div className="card">
          <h2>Пока нет концертов</h2>
          <p className="muted">Создайте первый концерт: мастер проведёт по трём шагам.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Начало</th>
                <th>Цена</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const archived = c.publicationStatus === "archived";
                const busy = busyId === c.id;
                return (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td className="nowrap">{formatBishkek(c.startsAt)}</td>
                    <td className="nowrap">{formatPrice(c.priceKgs)}</td>
                    <td>
                      <span className={PUB_CLASS[c.publicationStatus]}>{PUBLICATION_LABEL[c.publicationStatus]}</span>
                    </td>
                    <td>
                      <div className="actions">
                        {!archived && (
                          <Link className="btn btn-ghost btn-sm link-reset" role="button" href={`/admin/concerts/${c.id}`}>
                            Изменить
                          </Link>
                        )}
                        {c.publicationStatus === "draft" && (
                          <button className="btn btn-sm" type="button" disabled={busy} onClick={() => act(c.id, "/publication", { status: "published" })}>
                            Опубликовать
                          </button>
                        )}
                        {c.publicationStatus === "published" && (
                          <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => act(c.id, "/publication", { status: "draft" })}>
                            Снять с публикации
                          </button>
                        )}
                        {!archived && (
                          <>
                            <Link className="btn btn-ghost btn-sm link-reset" role="button" href={`/dashboard/streams/${c.id}/preview`}>
                              Просмотр
                            </Link>
                            <Link className="btn btn-ghost btn-sm link-reset" role="button" href={`/dashboard/streams/${c.id}`}>
                              Ключи
                            </Link>
                          </>
                        )}
                        {!archived &&
                          (confirmArchive === c.id ? (
                            <>
                              <button className="btn btn-danger btn-sm" type="button" disabled={busy} onClick={() => act(c.id, "/archive")}>
                                Да, в архив
                              </button>
                              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConfirmArchive(null)}>
                                Отмена
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-danger btn-sm" type="button" disabled={busy} onClick={() => setConfirmArchive(c.id)}>
                              В архив
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
