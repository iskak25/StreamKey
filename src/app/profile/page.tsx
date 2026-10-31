import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import PublicShell from "@/components/PublicShell";
import SignOutButton from "@/app/(account)/SignOutButton";
import { getViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Профиль — StreamKey", robots: { index: false, follow: false } };

const ROLE_LABEL = { GUEST: "Гость", USER: "Зритель", ADMIN: "Администратор", SUPER_ADMIN: "Администратор" } as const;

export default async function ProfilePage() {
  await connection();
  const user = await getViewer();
  if (!user) redirect(`/login?next=${encodeURIComponent("/profile")}`);
  const role = user.guest ? "Гость" : user.canCreateStreams && !user.isAdmin ? "Организатор" : ROLE_LABEL[user.role];

  return (
    <PublicShell user={user} active="profile">
      <div className="container section stack page-narrow">
        <h1 className="title-page">Профиль</h1>
        <div className="card stack">
          <div className="row">
            <div className="actions">
              <span className="avatar" aria-hidden="true">
                {user.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoUrl} alt="" referrerPolicy="no-referrer" width={40} height={40} />
                ) : (
                  <span>{(user.displayName.trim()[0] ?? "?").toUpperCase()}</span>
                )}
              </span>
              <div>
                <p>
                  <strong>{user.displayName}</strong>
                </p>
                <p className="meta">{user.guest ? "Гостевой доступ: без входа через Google" : user.email}</p>
              </div>
            </div>
            <span className="pill pill-primary">{role}</span>
          </div>
          <hr className="divider" />
          <div className="actions">
            <Link href="/tickets" className="btn btn-secondary">
              Мои билеты
            </Link>
            {user.canCreateStreams && (
              <Link href="/dashboard" className="btn btn-secondary">
                Кабинет организатора
              </Link>
            )}
            {user.isAdmin && (
              <Link href="/admin/concerts" className="btn btn-secondary">
                Панель
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
