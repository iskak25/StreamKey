"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import { formatDate, STREAM_STATUS } from "@/lib/client/format";

interface StreamItem {
  id: string;
  title: string;
  status: string;
  accessStartsAt: string;
  accessEndsAt: string;
  hasIssuedLinks: boolean;
  linksIssued: number;
}
interface Me {
  limits: { maxActiveStreams: number; maxLinksLifetime: number };
  usage: { activeStreams: number; issuedLifetime: number };
}
interface Page {
  items: StreamItem[];
  nextCursor: string | null;
}

export default function DashboardClient() {
  const router = useRouter();
  const [items, setItems] = useState<StreamItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ limit: "25" });
        if (after) q.set("cursor", after);
        const page = await api<Page>(`/streams?${q}`);
        setItems((prev) => (after && prev ? [...prev, ...page.items] : page.items));
        setCursor(page.nextCursor);
      } catch (e) {
        if (isAuthError(e)) router.replace("/login");
        else setError(organizerMessage(errCode(e)));
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    api<Me>("/me").then(setMe, () => {});
    void load(null);
  }, [load]);

  return (
    <div className="stack">
      <div className="row">
        <h1>Мои трансляции</h1>
        <Link href="/dashboard/streams/new" className="btn link-reset" role="button">
          Новая трансляция
        </Link>
      </div>

      <p className="muted">
        Ссылка ограничивает доступ к странице. YouTube Unlisted не защищает исходное видео от копирования и пересылки.
      </p>

      {me && (
        <div className="stats" aria-label="Сводка">
          <div className="stat">
            <span className="stat-value">
              {me.usage.activeStreams} <small>из {me.limits.maxActiveStreams}</small>
            </span>
            <span className="muted">Активных трансляций</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {me.usage.issuedLifetime} <small>из {me.limits.maxLinksLifetime}</small>
            </span>
            <span className="muted">Выдано ссылок</span>
          </div>
          <div className="stat">
            <span className="stat-value">{items?.filter((s) => s.status === "LIVE").length ?? 0}</span>
            <span className="muted">Сейчас в эфире</span>
          </div>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="chips" role="group" aria-label="Фильтр по статусу">
          {["ALL", ...Object.keys(STREAM_STATUS)]
            .filter((k) => k === "ALL" || items.some((s) => s.status === k))
            .map((k) => (
              <button key={k} type="button" className={`chip${filter === k ? " chip-on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {k === "ALL" ? `Все (${items.length})` : `${STREAM_STATUS[k]?.label} (${items.filter((s) => s.status === k).length})`}
              </button>
            ))}
        </div>
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {items === null && !error && <p className="muted">Загрузка…</p>}

      {items?.length === 0 && (
        <div className="card">
          <h2>Пока нет трансляций</h2>
          <p className="muted">Создайте запись трансляции, затем выдайте зрителям персональные ссылки.</p>
          <Link href="/dashboard/streams/new" className="btn link-reset" role="button">
            Создать первую трансляцию
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="list">
          {items.filter((s) => filter === "ALL" || s.status === filter).map((s) => {
            const st = STREAM_STATUS[s.status] ?? { label: s.status, cls: "pill" };
            return (
              <li key={s.id} className="list-item">
                <Link href={`/dashboard/streams/${s.id}`} className="link-reset">
                  <div className="row">
                    <strong>{s.title}</strong>
                    <span className={st.cls}>{st.label}</span>
                  </div>
                  <p className="muted">
                    {formatDate(s.accessStartsAt)} — {formatDate(s.accessEndsAt)} · Ключей: {s.linksIssued}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {cursor && (
        <button className="btn btn-ghost" type="button" onClick={() => load(cursor)} disabled={loading}>
          {loading ? "Загрузка…" : "Показать ещё"}
        </button>
      )}
    </div>
  );
}
