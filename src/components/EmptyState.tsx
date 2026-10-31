import type { ReactNode } from "react";
import Link from "next/link";
import { NoteIcon } from "./icons";

export default function EmptyState({ title, text, action }: { title: string; text?: string; action?: { href: string; label: string } | ReactNode }) {
  const isLink = action && typeof action === "object" && "href" in action && "label" in action;
  return (
    <div className="empty">
      <span className="icon">
        <NoteIcon size={22} />
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {isLink ? (
        <Link href={(action as { href: string }).href} className="btn btn-secondary">
          {(action as { label: string }).label}
        </Link>
      ) : (
        action
      )}
    </div>
  );
}
