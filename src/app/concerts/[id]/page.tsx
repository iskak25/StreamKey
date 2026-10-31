import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ticketState } from "@/components/ConcertCard";
import ConcertStatusBadge from "@/components/ConcertStatusBadge";
import PublicShell from "@/components/PublicShell";
import TicketPurchaseCard from "@/components/TicketPurchaseCard";
import { getPublishedConcert } from "@/lib/server/concerts";
import { orderStateFor } from "@/lib/server/orders";
import { getViewer } from "@/lib/server/viewer";
import { formatBishkek, formatPrice } from "@/lib/shared/concerts";

export const metadata: Metadata = { title: "Концерт — StreamKey" };

export default async function ConcertPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const concert = await getPublishedConcert(id).catch(() => null);
  if (!concert) notFound();
  const user = await getViewer();
  const order = user ? await orderStateFor(user.uid, id).catch(() => null) : null;
  const purchase = {
    concertId: concert.id,
    phase: concert.phase,
    priceKgs: concert.priceKgs,
    signedIn: user !== null,
    ticket: ticketState(order?.status),
    orderId: order?.id ?? null,
  };

  return (
    <PublicShell user={user} active="concerts" purchaseBar>
      <div className="container">
        <div className="concert-layout">
          <div className="stack">
            <Link href="/concerts" className="muted link-reset">
              ← Все концерты
            </Link>
            <div className="concert-hero-img">
              {concert.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={concert.coverUrl} alt="" width={1280} height={800} fetchPriority="high" decoding="async" />
              ) : null}
            </div>
            <div className="stack">
              <ConcertStatusBadge phase={concert.phase} />
              <h1 className="title-page">{concert.title}</h1>
              {concert.description && <p className="concert-description">{concert.description}</p>}
            </div>

            <div className="info-grid">
              <div className="info-item">
                <span className="label">Начало</span>
                <span className="value">{formatBishkek(concert.startsAt)}</span>
              </div>
              <div className="info-item">
                <span className="label">Окончание</span>
                <span className="value">{formatBishkek(concert.endsAt)}</span>
              </div>
              <div className="info-item">
                <span className="label">Билет</span>
                <span className="value">{formatPrice(concert.priceKgs)}</span>
              </div>
              <div className="info-item">
                <span className="label">Где смотреть</span>
                <span className="value">В одном браузере: компьютер, телефон или планшет</span>
              </div>
            </div>

            <section className="stack" aria-labelledby="how">
              <h2 id="how">Как получить доступ</h2>
              <ol className="steps-list">
                <li>Нажмите «Купить билет» и оплатите по QR-коду. Регистрация не нужна.</li>
                <li>Как только оплата подтвердится, трансляция откроется сама.</li>
                <li>Билет работает на одном устройстве одновременно: второй параллельный просмотр будет заблокирован.</li>
                <li>Чтобы не потерять билет, сохраните код восстановления на странице билета или войдите через Google.</li>
              </ol>
            </section>
          </div>

          <TicketPurchaseCard {...purchase} variant="card" />
        </div>
      </div>
      <TicketPurchaseCard {...purchase} variant="bar" />
    </PublicShell>
  );
}
