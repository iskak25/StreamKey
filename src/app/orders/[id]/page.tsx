import type { Metadata } from "next";
import { connection } from "next/server";
import OrderClient from "./OrderClient";

export const metadata: Metadata = { title: "Ваш билет — StreamKey", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return (
    <main className="page page-narrow">
      <OrderClient orderId={id} />
    </main>
  );
}
