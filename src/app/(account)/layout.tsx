import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountOrNull } from "@/lib/server/auth/page";
import { demoMode } from "@/lib/server/firebase-admin";
import Logo from "@/components/Logo";
import SignOutButton from "./SignOutButton";
import AdminNav, { type AdminNavItem } from "./AdminNav";

export const metadata: Metadata = { title: "Кабинет — StreamKey", robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const acc = await getAccountOrNull();
  if (!acc) redirect("/login");

  const isAdmin = acc.user.role === "ADMIN" || acc.user.role === "SUPER_ADMIN";
  const items: AdminNavItem[] = [{ href: "/dashboard", label: "Мои трансляции", match: "/dashboard" }];
  if (isAdmin) items.push({ href: "/admin/concerts", label: "Концерты", match: "/admin" });
  items.push({ href: "/", label: "На сайт", match: "/\u0000" });

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <Link href="/" aria-label="StreamKey — на сайт">
            <Logo width={156} />
          </Link>
        </div>
        <AdminNav items={items} />
        <div className="admin-user">
          <p>
            <strong>{acc.user.displayName}</strong>
          </p>
          <p className="meta">{acc.user.contactEmail ?? acc.user.authEmail}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="admin-main">
        {demoMode && (
          <p className="banner">
            Демо-режим: вход отключён, кабинет открыт, данные хранятся в памяти сервера. Они пропадают при перезапуске и могут не сохраняться между
            запросами на Vercel.
          </p>
        )}
        {children}
        <div className="admin-user-mobile">
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
