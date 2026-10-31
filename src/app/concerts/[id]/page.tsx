import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Logo from "@/components/Logo";
import BuyButton from "./BuyButton";
import { getPublishedConcert } from "@/lib/server/concerts";
import { formatBishkek, formatPrice, PHASE_LABEL } from "@/lib/shared/concerts";

export const metadata: Metadata = { title: "Концерт — StreamKey" };

export default async function ConcertPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const concert = await getPublishedConcert(id).catch(() => null);
  if (!concert) notFound();

  return (
    <div className="light">
      <header className="topbar">
        <Link href="/" aria-label="StreamKey — все концерты">
          <Logo width={120} />
        </Link>
      </header>
      <main className="page stack">
        <Link href="/">← Все концерты</Link>
        {concert.coverUrl && (
          <div className="concert-cover concert-cover-large">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={concert.coverUrl} alt="" />
          </div>
        )}
        <span className="pill">{PHASE_LABEL[concert.phase]}</span>
        <h1>{concert.title}</h1>
        <p className="concert-meta">
          {formatBishkek(concert.startsAt)} — {formatBishkek(concert.endsAt)}
        </p>
        {concert.description && <p className="concert-description">{concert.description}</p>}
        <p className="concert-price">{formatPrice(concert.priceKgs)}</p>
        <BuyButton concertId={concert.id} ended={concert.phase === "ended"} free={concert.priceKgs === 0} />
        <p className="muted">После оплаты вы сразу получите персональную ссылку на трансляцию. Ссылка открывается один раз и закрепляется за вашим браузером.</p>
      </main>
    </div>
  );
}
