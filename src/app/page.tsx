import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import ConcertCard from "@/components/ConcertCard";
import Logo from "@/components/Logo";
import { getAccountOrNull } from "@/lib/server/auth/page";
import { listPublishedConcerts } from "@/lib/server/concerts";

export const metadata: Metadata = { title: "StreamKey — концерты", description: "Онлайн-трансляции с персональным доступом" };

export default async function Home() {
  await connection();
  let concerts: Awaited<ReturnType<typeof listPublishedConcerts>> = [];
  let failed = false;
  try {
    concerts = await listPublishedConcerts();
  } catch {
    failed = true;
  }

  // Only a convenience: the edit page and every admin API re-check the role on the server.
  const acc = await getAccountOrNull();
  const isAdmin = acc?.actor.status === "ACTIVE" && (acc.actor.role === "ADMIN" || acc.actor.role === "SUPER_ADMIN");

  return (
    <div className="light">
      <header className="topbar">
        <Logo width={120} />
        <div className="topbar-right">
          <Link href="/dashboard">Кабинет организатора</Link>
        </div>
      </header>
      <main className="page page-wide stack">
        <h1>Концерты</h1>
        {failed && <p className="notice notice-error" role="alert">Не удалось загрузить список. Обновите страницу чуть позже.</p>}
        {!failed && concerts.length === 0 && (
          <div className="card">
            <h2>Пока нет опубликованных концертов</h2>
            <p className="muted">Загляните позже: новые трансляции появятся здесь.</p>
          </div>
        )}
        <div className="concert-grid">
          {concerts.map((c) => (
            <ConcertCard key={c.id} concert={c} href={`/concerts/${c.id}`} editHref={isAdmin ? `/admin/concerts/${c.id}` : null} />
          ))}
        </div>
      </main>
    </div>
  );
}
