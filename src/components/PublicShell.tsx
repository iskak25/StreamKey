import type { ReactNode } from "react";
import type { SiteUser } from "@/lib/server/viewer";
import MobileNavigation from "./MobileNavigation";
import SiteFooter from "./SiteFooter";
import SiteHeader, { type NavKey } from "./SiteHeader";

/** Frame of every public page: header, content, footer and the phone tab bar. */
export default function PublicShell({
  user,
  active,
  children,
  purchaseBar = false,
}: {
  user: SiteUser | null;
  active: NavKey | null;
  children: ReactNode;
  /** The page pins a purchase bar above the tab bar on phones: leave room for it. */
  purchaseBar?: boolean;
}) {
  return (
    <div className={`has-mobile-nav${purchaseBar ? " has-purchase-bar" : ""}`}>
      <SiteHeader user={user} active={active} />
      <main className="site-main">{children}</main>
      <SiteFooter />
      <MobileNavigation user={user} active={active} />
    </div>
  );
}
