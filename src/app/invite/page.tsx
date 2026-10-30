import type { Metadata } from "next";
import { connection } from "next/server";
import InviteClient from "./InviteClient";

export const metadata: Metadata = { title: "Приглашение — StreamKey", robots: { index: false, follow: false } };

export default async function InvitePage() {
  await connection();
  return (
    <main className="page page-narrow">
      <InviteClient />
    </main>
  );
}
