import Link from "next/link";
import { formatBishkek, formatPrice } from "@/lib/shared/concerts";
import { cardAction, type ConcertCardData, type TicketState } from "./ConcertCard";
import ConcertStatusBadge from "./ConcertStatusBadge";

/** Featured concert: big cover, cinematic gradient, one clear action. No auto-rotation. */
export default function HeroConcert({ concert, ticket = null }: { concert: ConcertCardData; ticket?: TicketState }) {
  const action = cardAction(concert.phase, ticket);
  const primary = ticket === "paid" && concert.phase !== "ended" ? "Смотреть трансляцию" : action === "Ожидаем оплату" ? "Проверить оплату" : "Купить билет";
  const href = `/concerts/${concert.id}`;
  return (
    <section className="hero" aria-label="Главный концерт">
      {concert.coverUrl ? (
        <div className="hero-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={concert.coverUrl} alt="" width={1280} height={720} fetchPriority="high" decoding="async" />
        </div>
      ) : (
        <div className="hero-empty" />
      )}
      <div className="container">
        <div className="hero-content">
          <ConcertStatusBadge phase={concert.phase} />
          <div className="hero-text stack">
            <h1 className="title-hero">{concert.title}</h1>
            <div className="hero-meta">
              <span>{formatBishkek(concert.startsAt)}</span>
            </div>
            {concert.description && <p className="hero-desc">{concert.description}</p>}
          </div>
          <p className="hero-price">{formatPrice(concert.priceKgs)}</p>
          <div className="actions">
            {action && (
              <Link href={href} className="btn btn-lg">
                {primary}
              </Link>
            )}
            <Link href={href} className="btn btn-secondary btn-lg">
              Подробнее
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
