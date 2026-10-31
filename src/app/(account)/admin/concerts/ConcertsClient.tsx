"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import { formatBishkek, formatPrice, PUBLICATION_LABEL, type PublicationStatus } from "@/lib/shared/concerts";
import ConcertQr from "@/components/ConcertQr";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import { RowListSkeleton } from "@/components/LoadingSkeleton";

interface Concert {
  id: string;
  title: string;
  priceKgs: number;
  startsAt: string;
  endsAt: string;
  publicationStatus: PublicationStatus;
}

type Filter = "all" | PublicationStatus;
type SortKey = "startsAt" | "title" | "priceKgs";

const PUB_CLASS: Record<PublicationStatus, string> = { draft: "pill", published: "pill pill-ok", archived: "pill pill-danger" };
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "published", label: "Опубликованы" },
  { key: "draft", label: "Черновики" },
  { key: "archived", label: "Архив" },
];
const PAGE_SIZE = 10;

export default function ConcertsClient() {
  const router = useRouter();
  const [items, setItems] = useState<Concert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<Concert | null>(null);
  const [qrFor, setQrFor] = useState<Concert | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "startsAt", dir: -1 });
  const [page, setPage] = useState(1);
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
      await load();
    } catch (e) {
      if (isAuthError(e)) router.replace("/login");
      else setError(organizerMessage(errCode(e)));
    } finally {
      setConfirmArchive(null);
      lock.current = false;
      setBusyId(null);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (items ?? []).filter((c) => (filter === "all" || c.publicationStatus === filter) && (!q || c.title.toLowerCase().includes(q)));
    const { key, dir } = sort;
    return list.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ru")) * dir;
    });
  }, [items, query, filter, sort]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "title" ? 1 : -1 }));
    setPage(1);
  }
  function sortHead(key: SortKey, label: string) {
    const active = sort.key === key;
    return (
      <button type="button" className="th-sort" onClick={() => toggleSort(key)} aria-label={`Сортировать: ${label}`}>
        {label}
        <span aria-hidden="true">{active ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
      </button>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <h1>Концерты</h1>
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
      {items === null && !error && <RowListSkeleton count={4} />}
      {items?.length === 0 && (
        <EmptyState title="Пока нет концертов" text="Создайте первый концерт: мастер проведёт по трём шагам." action={{ href: "/admin/concerts/new", label: "Новый концерт" }} />
      )}
      {items && items.length > 0 && (
        <>
          <div className="stack">
            <label className="search">
              <span className="sr-only">Поиск по названию</span>
              <input
                type="search"
                placeholder="Поиск по названию"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <div className="chips" role="group" aria-label="Фильтр по статусу">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="chip"
                  aria-current={filter === f.key ? "true" : undefined}
                  onClick={() => {
                    setFilter(f.key);
                    setPage(1);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="Ничего не найдено" text="Измените запрос или фильтр." />
          ) : (
            <div className="table-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>{sortHead("title", "Название")}</th>
                    <th>{sortHead("startsAt", "Начало")}</th>
                    <th>{sortHead("priceKgs", "Цена")}</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const archived = c.publicationStatus === "archived";
                    const busy = busyId === c.id;
                    return (
                      <tr key={c.id}>
                        <td data-label="Название">{c.title}</td>
                        <td data-label="Начало" className="nowrap">
                          {formatBishkek(c.startsAt)}
                        </td>
                        <td data-label="Цена" className="nowrap">
                          {formatPrice(c.priceKgs)}
                        </td>
                        <td data-label="Статус">
                          <span className={PUB_CLASS[c.publicationStatus]}>{PUBLICATION_LABEL[c.publicationStatus]}</span>
                        </td>
                        <td className="cell-actions">
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
                                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setQrFor(c)}>
                                  QR-код
                                </button>
                                <button className="btn btn-danger btn-sm" type="button" disabled={busy} onClick={() => setConfirmArchive(c)}>
                                  В архив
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="pager">
              <span className="muted">
                Страница {current} из {pages}
              </span>
              <div className="actions">
                <button className="btn btn-ghost btn-sm" type="button" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                  Назад
                </button>
                <button className="btn btn-ghost btn-sm" type="button" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                  Далее
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {qrFor && <ConcertQr concertId={qrFor.id} title={qrFor.title} open onClose={() => setQrFor(null)} />}
      <ConfirmDialog
        open={confirmArchive !== null}
        title="Отправить концерт в архив?"
        confirmLabel="В архив"
        danger
        busy={busyId !== null}
        onConfirm={() => confirmArchive && act(confirmArchive.id, "/archive")}
        onCancel={() => setConfirmArchive(null)}
      >
        «{confirmArchive?.title}» пропадёт из афиши. Записи о билетах и оплатах сохранятся.
      </ConfirmDialog>
    </div>
  );
}
