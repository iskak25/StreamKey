import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <span>© {new Date().getFullYear()} StreamKey · Один ключ — один зритель</span>
        <nav className="actions" aria-label="Нижняя навигация">
          <Link href="/concerts" className="link-reset">
            Концерты
          </Link>
          <Link href="/tickets" className="link-reset">
            Мои билеты
          </Link>
        </nav>
      </div>
    </footer>
  );
}
