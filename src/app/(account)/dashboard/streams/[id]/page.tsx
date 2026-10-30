import { connection } from "next/server";
import StreamClient from "./StreamClient";

export default async function StreamPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return <StreamClient id={id} />;
}
