import Link from "next/link";
import { formatBishkekShort, formatPrice, type ConcertPhase } from "@/lib/shared/concerts";
import ConcertAdminTools from "./ConcertAdminTools";
import ConcertStatusBadge from "./ConcertStatusBadge";
import { NoteIcon } from "./icons";

export interface ConcertCardData {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  priceKgs: number;
  startsAt: string;
  endsAt?: string;
  phase: ConcertPhase;
}

/** What the signed-in viewer already has for this concert. */
export type TicketState = "paid" | "pending" | null;

/** The one verb a card offers; ended concerts offer none (no recording is sold). */
export function cardAction(phase: ConcertPhase, ticket: TicketState): string | null {
  if (phase === "ended") return null;
  if (ticket === "paid") return phase === "live" ? "Смотреть" : "Билет куплен";
  if (ticket === "pending") return "Ожидаем оплату";
  return "Купить билет";
}

/**
 * Poster card (4:5) used by the catalog and the admin preview; "compact" is the horizontal form.
 * The whole card is one link (stretched title link); admin shortcuts sit above it.
 * Presentational: it never fetches anything.
 */
export default function ConcertCard({
  concert,
  href,
  ticket = null,
  adminTools = false,
  variant = "standard",
  eager = false,
}: {
  concert: ConcertCardData;
  href: string | null;
  ticket?: TicketState;
  adminTools?: boolean;
  variant?: "standard" | "compact";
  /** First-screen cards load immediately, the rest lazily. */
  eager?: boolean;
}) {
  const title = concert.title || "Название концерта";
  const action = cardAction(concert.phase, ticket);
  const titleNode = href ? (
    <Link className="card-link" href={href}>
      {title}
    </Link>
  ) : (
    title
  );
  const price = ticket === "paid" ? <span className="pill pill-ok">Билет куплен</span> : <span className="concert-price">{formatPrice(concert.priceKgs)}</span>;
  const cover = concert.coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={concert.coverUrl} alt="" width={400} height={500} loading={eager ? "eager" : "lazy"} decoding="async" />
  ) : (
    <div className="concert-cover-empty" aria-hidden="true">
      <NoteIcon size={40} />
    </div>
  );

  if (variant === "compact") {
    return (
      <article className="concert-row">
        <div className="thumb">{cover}</div>
        <div className="info">
          <ConcertStatusBadge phase={concert.phase} />
          <h3 className="concert-title">{titleNode}</h3>
          <p className="concert-meta">{formatBishkekShort(concert.startsAt)}</p>
          <div className="actions">
            {price}
            {action && <span className="concert-action">{action}</span>}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="concert-card">
      {adminTools && <ConcertAdminTools concertId={concert.id} />}
      <div className="concert-cover">
        {cover}
        <ConcertStatusBadge phase={concert.phase} />
      </div>
      <div className="concert-body">
        <h2 className="concert-title">{titleNode}</h2>
        <p className="concert-meta">{formatBishkekShort(concert.startsAt)}</p>
        {concert.description && <p className="concert-desc">{concert.description}</p>}
        <div className="concert-foot">
          {price}
          {action && <span className="concert-action">{action} →</span>}
        </div>
      </div>
    </article>
  );
}

/** Order status (as stored) to what a card shows. */
export function ticketState(status: "PENDING" | "PAID" | "FAILED" | undefined | null): TicketState {
  return status === "PAID" ? "paid" : status === "PENDING" ? "pending" : null;
}
