import { connection } from "next/server";
import NewStreamClient from "./NewStreamClient";

export default async function NewStreamPage() {
  await connection();
  return <NewStreamClient />;
}
