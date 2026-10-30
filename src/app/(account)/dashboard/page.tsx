import { connection } from "next/server";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  await connection();
  return <DashboardClient />;
}
