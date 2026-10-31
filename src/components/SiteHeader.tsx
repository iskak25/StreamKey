import Link from "next/link";
import type { SiteUser } from "@/lib/server/viewer";
import Avatar from "./Avatar";
import Logo from "./Logo";

export type NavKey = "home" | "concerts" | "tickets" | "profile";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "home", href: "/", label: "Главная" },
  { key: "concerts", href: "/concerts", label: "Концерты" },
  { key: "tickets", href: "/tickets", label: "Мои билеты" },
];

/** Sticky top bar. On phones only the logo and the account stay here; the tabs live in MobileNavigation. */
export default function SiteHeader({ user, active }: { user: SiteUser | null; active: NavKey | null }) {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link href="/" className="brand" aria-label="StreamKey — на главную">
          <Logo width={156} />
        </Link>
        <nav className="site-nav" aria-label="Основная навигация">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} className="nav-link" aria-current={active === n.key ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="header-right">
          {user?.isAdmin && (
            <Link href="/admin/concerts" className="btn btn-secondary btn-sm">
              Панель
            </Link>
          )}
          {user && !user.isAdmin && user.canCreateStreams && (
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              Кабинет
            </Link>
          )}
          {user?.guest && (
            <Link href="/login" className="btn btn-secondary btn-sm">
              Войти через Google
            </Link>
          )}
          {user ? (
            <Avatar photoUrl={user.photoUrl} name={user.displayName} />
          ) : (
            <Link href="/login" className="btn btn-sm">
              Войти
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
