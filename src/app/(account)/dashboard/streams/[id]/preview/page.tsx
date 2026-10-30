import { connection } from "next/server";
import PreviewClient from "./PreviewClient";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return <PreviewClient id={id} />;
}
