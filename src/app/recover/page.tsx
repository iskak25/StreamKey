import type { Metadata } from "next";
import { connection } from "next/server";
import PublicShell from "@/components/PublicShell";
import { getViewer } from "@/lib/server/viewer";
import RecoverClient from "./RecoverClient";

export const metadata: Metadata = { title: "Восстановить билет — StreamKey", robots: { index: false, follow: false } };

export default async function RecoverPage() {
  await connection();
  const user = await getViewer();
  return (
    <PublicShell user={user} active="tickets">
      <div className="auth-wrap">
        <RecoverClient signedIn={user !== null} />
      </div>
    </PublicShell>
  );
}
