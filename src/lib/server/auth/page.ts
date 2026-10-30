import "server-only";
import { cookies } from "next/headers";
import { demoMode } from "../firebase-admin";
import { COOKIE } from "../http";
import { requireAccountByCookie, type AccountContext } from "./account";

/**
 * For server-rendered pages only: gates the UI shell. It is a convenience, not the security
 * boundary: every API call re-verifies the session and the current user document.
 */
export async function getAccountOrNull(): Promise<AccountContext | null> {
  const cookie = (await cookies()).get(COOKIE.account)?.value;
  if (!cookie && !demoMode) return null; // demo mode has no sign-in: requireAccountByCookie supplies the demo account
  try {
    return await requireAccountByCookie(cookie);
  } catch {
    return null;
  }
}
