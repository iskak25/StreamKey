import ConcertStatusBadge from "@/components/ConcertStatusBadge";
import EmptyState from "@/components/EmptyState";
import PublicPlayer from "@/components/PublicPlayer";
import PublicShell from "@/components/PublicShell";
import { getPublicViewingConcert, type PublicViewingConcert } from "@/lib/server/concerts";
import { getViewer } from "@/lib/server/viewer";
import { formatBishkek } from "@/lib/shared/concerts";

/** Open page of a public-viewing concert: title, status and the YouTube player. No ticket, sign-in or purchase controls. */
export default async function PublicViewing({ id }: { id: string }) {
  let concert: PublicViewingConcert | null = null;
  let failed = false;
  try {
    concert = await getPublicViewingConcert(id);
  } catch {
    failed = true;
  }
  const user = await getViewer().catch(() => null);

  return (
    <PublicShell user={user} active="concerts">
      <div className="container section stack">
        {failed ? (
          <EmptyState title="Сервис временно недоступен" text="Не удалось загрузить трансляцию. Обновите страницу через пару минут." />
        ) : !concert ? (
          <EmptyState title="Концерт не найден" text="Проверьте ссылку или откройте афишу." action={{ href: "/concerts", label: "Смотреть концерты" }} />
        ) : (
          <>
            <div className="stack">
              <ConcertStatusBadge phase={concert.phase} />
              <h1 className="title-page">{concert.title}</h1>
              <p className="muted">
                {formatBishkek(concert.startsAt)} — {formatBishkek(concert.endsAt)}
              </p>
            </div>
            {concert.videoId ? (
              <PublicPlayer videoId={concert.videoId} />
            ) : (
              <EmptyState title="Трансляция пока не настроена" text="Организатор ещё не указал ссылку на YouTube. Загляните позже." />
            )}
            {concert.description && <p className="concert-description">{concert.description}</p>}
          </>
        )}
      </div>
    </PublicShell>
  );
}
