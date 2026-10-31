import "server-only";
import type { Role } from "@/lib/shared/roles";
import { getAccountOrNull } from "./auth/page";

/** What the site chrome needs to know about the signed-in person. No secrets, nothing about other users. */
export interface SiteUser {
  uid: string;
  displayName: string;
  email: string;
  photoUrl: string | null;
  role: Role;
  canCreateStreams: boolean;
  isAdmin: boolean;
  /** Anonymous guest: can buy and watch, but has no Google account (yet). */
  guest: boolean;
}

/** For server-rendered pages: the UI shell only. Every API call re-checks the session and the role. */
export async function getViewer(): Promise<SiteUser | null> {
  const acc = await getAccountOrNull();
  if (!acc) return null;
  const { user, actor } = acc;
  return {
    uid: actor.uid,
    displayName: user.displayName || user.authEmail,
    email: user.authEmail,
    photoUrl: user.photoUrl ?? null,
    role: actor.role,
    canCreateStreams: user.permissions.canCreateStreams,
    guest: user.guest === true,
    isAdmin: actor.status === "ACTIVE" && (actor.role === "ADMIN" || actor.role === "SUPER_ADMIN"),
  };
}
