import type { Metadata } from "next";
import { connection } from "next/server";
import Logo from "@/components/Logo";
import WatchClient from "./WatchClient";

// No video data, titles or ids here: everything comes from the authorized /viewer/access call.
export const metadata: Metadata = { title: "Просмотр — StreamKey", robots: { index: false, follow: false } };

export default async function WatchPage({ params }: { params: Promise<{ linkId: string }> }) {
  await connection();
  const { linkId } = await params;
  return (
    <main className="watch-page">
      <Logo width={120} plate />
      <WatchClient linkId={linkId} />
    </main>
  );
}
