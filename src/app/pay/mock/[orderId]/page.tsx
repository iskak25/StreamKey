import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import MockPayClient from "./MockPayClient";

export const metadata: Metadata = { title: "Тестовая оплата — StreamKey", robots: { index: false, follow: false } };

export default async function MockPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  await connection();
  if (process.env.PAYMENTS_PROVIDER !== "mock") notFound();
  const { orderId } = await params;
  return (
    <main className="page page-narrow">
      <MockPayClient orderId={orderId} />
    </main>
  );
}
