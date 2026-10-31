import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAccountOrNull } from "@/lib/server/auth/page";

/**
 * UI gate only (a convenience: non-admins land back on the cabinet). The real control is requireAdmin()
 * inside every /api/v1/admin/* handler, which re-reads the role from the database on each request.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const acc = await getAccountOrNull();
  if (!acc || (acc.actor.role !== "ADMIN" && acc.actor.role !== "SUPER_ADMIN")) redirect("/dashboard");
  return children;
}
