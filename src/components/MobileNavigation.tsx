import Link from "next/link";
import type { SiteUser } from "@/lib/server/viewer";
import { FilmIcon, HomeIcon, TicketIcon, UserIcon } from "./icons";
import type { NavKey } from "./SiteHeader";

/** Bottom tab bar for phones (hidden from 768px up). Safe-area aware. */
export default function MobileNavigation({ user, active }: { user: SiteUser | null; active: NavKey | null }) {
  const cur = (k: NavKey) => (active === k ? "page" : undefined);
  return (
    <nav className="mobile-nav" aria-label="Навигация">
      <Link href="/" aria-current={cur("home")}>
        <HomeIcon />
        Главная
      </Link>
      <Link href="/concerts" aria-current={cur("concerts")}>
        <FilmIcon />
        Концерты
      </Link>
      <Link href="/tickets" aria-current={cur("tickets")}>
        <TicketIcon />
        Билеты
      </Link>
      <Link href={user ? "/profile" : "/login"} aria-current={cur("profile")}>
        <UserIcon />
        {user ? "Профиль" : "Войти"}
      </Link>
    </nav>
  );
}
