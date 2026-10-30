import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountOrNull } from "@/lib/server/auth/page";
import { demoMode } from "@/lib/server/firebase-admin";
import Logo from "@/components/Logo";
import SignOutButton from "./SignOutButton";

export const metadata: Metadata = { title: "Кабинет — StreamKey", robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const acc = await getAccountOrNull();
  if (!acc) redirect("/login");

  return (
    <div className="light">
      <header className="topbar">
        <Link href="/dashboard" aria-label="StreamKey — мои трансляции"><Logo width={120} /></Link>
        <div className="topbar-right">
          <span className="muted">{acc.user.displayName}</span>
          <SignOutButton />
        </div>
      </header>
      {demoMode && (
        <p className="banner">Демо-режим: вход отключён, данные хранятся в памяти сервера и пропадут при его перезапуске.</p>
      )}
      <main className="page">{children}</main>
    </div>
  );
}
