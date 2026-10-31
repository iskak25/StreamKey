import Link from "next/link";
import { formatBishkek, formatPrice, PHASE_LABEL, type ConcertPhase } from "@/lib/shared/concerts";

export interface ConcertCardData {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  priceKgs: number;
  startsAt: string;
  phase: ConcertPhase;
}

const PHASE_CLASS: Record<ConcertPhase, string> = { soon: "pill pill-warn", live: "pill pill-ok", ended: "pill" };

/** Presentational only (used by the public catalog and by the admin wizard preview). */
export default function ConcertCard({ concert, href, editHref = null }: { concert: ConcertCardData; href: string | null; editHref?: string | null }) {
  return (
    <article className="concert-card">
      {editHref && (
        <Link className="concert-edit" href={editHref} aria-label="Редактировать концерт" title="Редактировать">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </Link>
      )}
      <div className="concert-cover">
        {concert.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={concert.coverUrl} alt="" loading="lazy" />
        ) : (
          <div className="concert-cover-empty" aria-hidden="true">
            ♪
          </div>
        )}
      </div>
      <div className="concert-body">
        <span className={PHASE_CLASS[concert.phase]}>{PHASE_LABEL[concert.phase]}</span>
        <h2>{concert.title || "Название концерта"}</h2>
        {concert.description && <p className="muted">{concert.description}</p>}
        <p className="concert-meta">{formatBishkek(concert.startsAt)}</p>
        <p className="concert-price">{formatPrice(concert.priceKgs)}</p>
        {href ? (
          <Link className="btn btn-brand link-reset" role="button" href={href}>
            Подробнее
          </Link>
        ) : (
          <span className="btn btn-brand" aria-disabled="true">
            Подробнее
          </span>
        )}
      </div>
    </article>
  );
}
