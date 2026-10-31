import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PublicShell from "@/components/PublicShell";
import { getAccountOrNull } from "@/lib/server/auth/page";
import { safeNext } from "@/lib/shared/next-path";
import LoginClient from "./LoginClient";

export const metadata: Metadata = { title: "Вход — StreamKey", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getAccountOrNull()) redirect(next ?? "/");
  return (
    <PublicShell user={null} active="profile">
      <div className="auth-wrap">
        <LoginClient next={next} />
      </div>
    </PublicShell>
  );
}
