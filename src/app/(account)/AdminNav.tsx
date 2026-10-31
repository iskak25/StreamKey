"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface AdminNavItem {
  href: string;
  label: string;
  match: string;
}

export default function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Разделы кабинета">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="nav-link" aria-current={pathname.startsWith(i.match) ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
