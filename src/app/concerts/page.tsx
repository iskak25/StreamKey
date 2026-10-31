import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ConcertCard, { ticketState } from "@/components/ConcertCard";
import EmptyState from "@/components/EmptyState";
import PublicShell from "@/components/PublicShell";
import { listPublishedConcerts } from "@/lib/server/concerts";
import { ticketStatusMap } from "@/lib/server/orders";
import { getViewer } from "@/lib/server/viewer";
import type { ConcertPhase } from "@/lib/shared/concerts";

export const metadata: Metadata = { title: "Концерты — StreamKey" };

const FILTERS: { key: "all" | ConcertPhase; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "live", label: "В эфире" },
  { key: "soon", label: "Скоро" },
  { key: "ended", label: "Завершённые" },
];

export default async function ConcertsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await connection();
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status)?.key ?? "all";
  const user = await getViewer();
  let concerts: Awaited<ReturnType<typeof listPublishedConcerts>> = [];
  let failed = false;
  try {
    concerts = await listPublishedConcerts();
  } catch {
    failed = true;
  }
  const tickets: Awaited<ReturnType<typeof ticketStatusMap>> = user ? await ticketStatusMap(user.uid).catch(() => ({})) : {};
  const shown = filter === "all" ? concerts : concerts.filter((c) => c.phase === filter);

  return (
    <PublicShell user={user} active="concerts">
      <div className="container section stack">
        <h1 className="title-page">Концерты</h1>
        <nav className="chips" aria-label="Фильтр по статусу">
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key === "all" ? "/concerts" : `/concerts?status=${f.key}`} className="chip" aria-current={filter === f.key ? "true" : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
        {failed && (
          <p className="notice notice-error" role="alert">
            Не удалось загрузить список. Обновите страницу чуть позже.
          </p>
        )}
        {!failed && shown.length === 0 && (
          <EmptyState title="Здесь пока пусто" text={filter === "all" ? "Концертов пока нет." : "В этом разделе нет концертов."} action={filter === "all" ? undefined : { href: "/concerts", label: "Показать все" }} />
        )}
        <div className="concert-grid">
          {shown.map((c, i) => (
            <ConcertCard key={c.id} concert={c} href={`/concerts/${c.id}`} ticket={ticketState(tickets[c.id])} adminTools={user?.isAdmin} eager={i < 4} />
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
