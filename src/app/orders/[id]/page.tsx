import type { Metadata } from "next";
import { connection } from "next/server";
import PublicShell from "@/components/PublicShell";
import { getViewer } from "@/lib/server/viewer";
import OrderClient from "./OrderClient";

export const metadata: Metadata = { title: "Ваш билет — StreamKey", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const user = await getViewer();
  return (
    <PublicShell user={user} active="tickets">
      <div className="auth-wrap">
        <OrderClient orderId={id} />
      </div>
    </PublicShell>
  );
}
