export const ROLES = ["GUEST", "USER", "ADMIN", "SUPER_ADMIN"] as const;
export type Role = (typeof ROLES)[number];
export type UserStatus = "ACTIVE" | "BLOCKED" | "DELETING";

export interface Actor {
  uid: string;
  role: Role;
  status: UserStatus;
}

const isPrivileged = (r: Role) => r === "ADMIN" || r === "SUPER_ADMIN";

export function isActive(actor: Actor): boolean {
  return actor.status === "ACTIVE";
}

/** Can the actor manage (edit profile/limits/block) the target user? */
export function canManageUser(actor: Actor, target: { uid: string; role: Role }): boolean {
  if (!isActive(actor)) return false;
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "ADMIN") return !isPrivileged(target.role) && actor.uid !== target.uid;
  return false;
}

/** Can the actor set `newRole` on the target? Self-promotion is never allowed. */
export function canAssignRole(actor: Actor, target: { uid: string; role: Role }, newRole: Role): boolean {
  if (!isActive(actor) || actor.uid === target.uid) return false;
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "ADMIN") {
    return !isPrivileged(target.role) && (newRole === "GUEST" || newRole === "USER");
  }
  return false;
}

export function canCreateStreams(actor: Actor, permissionFlag: boolean): boolean {
  return isActive(actor) && actor.role !== "GUEST" && permissionFlag;
}

export function canAccessStream(actor: Actor, stream: { ownerUid: string }): boolean {
  if (!isActive(actor)) return false;
  if (isPrivileged(actor.role)) return true;
  return actor.role === "USER" && stream.ownerUid === actor.uid;
}
