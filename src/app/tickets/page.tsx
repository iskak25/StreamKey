import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import ConcertStatusBadge from "@/components/ConcertStatusBadge";
import EmptyState from "@/components/EmptyState";
import { NoteIcon } from "@/components/icons";
import PublicShell from "@/components/PublicShell";
import { listMyTickets } from "@/lib/server/orders";
import { getViewer } from "@/lib/server/viewer";
import { formatBishkekShort } from "@/lib/shared/concerts";

export const metadata: Metadata = { title: "Мои билеты — StreamKey", robots: { index: false, follow: false } };

export default async function TicketsPage() {
  await connection();
  const user = await getViewer();
  if (!user) redirect(`/login?next=${encodeURIComponent("/tickets")}`);

  let tickets: Awaited<ReturnType<typeof listMyTickets>> = [];
  let failed = false;
  try {
    tickets = await listMyTickets(user.uid);
  } catch {
    failed = true;
  }

  return (
    <PublicShell user={user} active="tickets">
      <div className="container section stack">
        <h1 className="title-page">Мои билеты</h1>
        {failed && (
          <p className="notice notice-error" role="alert">
            Не удалось загрузить билеты. Обновите страницу чуть позже.
          </p>
        )}
        {!failed && tickets.length === 0 && <EmptyState title="Билетов пока нет" text="Выберите концерт в афише и купите билет: он появится здесь." action={{ href: "/concerts", label: "Смотреть концерты" }} />}
        <div className="ticket-list">
          {tickets.map((t) => {
            const paid = t.status === "PAID";
            const closed = t.withdrawn || t.phase === "ended";
            // Paid and still running: the order page hands over the link or resumes viewing.
            const action = !paid ? "Проверить оплату" : closed ? null : t.phase === "live" ? "Смотреть" : "Ожидание начала";
            const href = `/orders/${t.orderId}`;
            return (
              <article key={t.orderId} className="concert-row">
                <div className="thumb">
                  {t.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.coverUrl} alt="" width={96} height={120} loading="lazy" decoding="async" />
                  ) : (
                    <div className="concert-cover-empty" aria-hidden="true">
                      <NoteIcon size={28} />
                    </div>
                  )}
                </div>
                <div className="info">
                  <div className="actions">
                    {t.withdrawn ? <span className="pill">Снят с показа</span> : <ConcertStatusBadge phase={t.phase} />}
                    {!paid && <span className="pill pill-warn">Ожидаем оплату</span>}
                    {paid && <span className="pill pill-ok">Оплачен</span>}
                  </div>
                  <h2 className="concert-title">{t.title}</h2>
                  <p className="concert-meta">{formatBishkekShort(t.startsAt)}</p>
                  {action && (
                    <Link href={href} className="btn btn-sm">
                      {action}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </PublicShell>
  );
}
