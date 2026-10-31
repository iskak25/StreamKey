import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ConcertCard, { ticketState } from "@/components/ConcertCard";
import EmptyState from "@/components/EmptyState";
import HeroConcert from "@/components/HeroConcert";
import PublicShell from "@/components/PublicShell";
import { listPublishedConcerts } from "@/lib/server/concerts";
import { ticketStatusMap } from "@/lib/server/orders";
import { getViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "StreamKey — онлайн-концерты", description: "Афиша онлайн-концертов с персональным доступом" };

type Concerts = Awaited<ReturnType<typeof listPublishedConcerts>>;

export default async function Home() {
  await connection();
  const user = await getViewer();
  let concerts: Concerts = [];
  let failed = false;
  try {
    concerts = await listPublishedConcerts();
  } catch {
    failed = true;
  }
  const tickets: Awaited<ReturnType<typeof ticketStatusMap>> = user ? await ticketStatusMap(user.uid).catch(() => ({})) : {};
  const live = concerts.filter((c) => c.phase === "live");
  const soon = concerts.filter((c) => c.phase === "soon");
  const ended = concerts.filter((c) => c.phase === "ended");
  // Featured: what is on air, else what starts next, else the latest finished one. Nothing is invented.
  const featured = live[0] ?? soon[0] ?? ended[0] ?? null;
  const grid = (items: Concerts, eagerFrom = 0) => (
    <div className="concert-grid">
      {items.map((c, i) => (
        <ConcertCard key={c.id} concert={c} href={`/concerts/${c.id}`} ticket={ticketState(tickets[c.id])} adminTools={user?.isAdmin} eager={i < eagerFrom} />
      ))}
    </div>
  );

  return (
    <PublicShell user={user} active="home">
      {failed && (
        <div className="container section">
          <p className="notice notice-error" role="alert">
            Не удалось загрузить афишу. Обновите страницу чуть позже.
          </p>
        </div>
      )}
      {!failed && concerts.length === 0 && (
        <div className="container section">
          <EmptyState title="Пока нет опубликованных концертов" text="Загляните позже: новые трансляции появятся здесь." />
        </div>
      )}
      {featured && <HeroConcert concert={featured} ticket={ticketState(tickets[featured.id])} />}

      {concerts.length > 0 && (
        <>
          <section className="container section" aria-labelledby="live-title">
            <div className="section-head">
              <h2 id="live-title">Сейчас в эфире</h2>
            </div>
            {live.length > 0 ? grid(live, 4) : <EmptyState title="Сейчас нет прямых эфиров" text="Ближайшие концерты ниже в разделе «Скоро начнутся»." />}
          </section>

          <section className="container section" aria-labelledby="soon-title">
            <div className="section-head">
              <h2 id="soon-title">Скоро начнутся</h2>
              <Link href="/concerts" className="muted link-reset">
                Все концерты →
              </Link>
            </div>
            {soon.length > 0 ? grid(soon) : <EmptyState title="Новые концерты появятся здесь" text="Анонсы пока не опубликованы." />}
          </section>

          {ended.length > 0 && (
            <section className="container section" aria-labelledby="ended-title">
              <div className="section-head">
                <h2 id="ended-title">Завершённые</h2>
              </div>
              {grid(ended)}
            </section>
          )}
        </>
      )}
    </PublicShell>
  );
}
