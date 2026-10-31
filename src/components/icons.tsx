import type { ReactNode } from "react";

/** Small stroke icon set (24px grid). Decorative: always aria-hidden, the text next to it carries the meaning. */
function Icon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const HomeIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Icon>
);
export const FilmIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Icon>
);
export const TicketIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1Z" />
    <path d="M13 5v14" strokeDasharray="2 3" />
  </Icon>
);
export const UserIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);
export const NoteIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Icon>
);
export const PencilIcon = ({ size }: { size?: number }) => (
  <Icon size={size ?? 18}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);
export const TrashIcon = ({ size }: { size?: number }) => (
  <Icon size={size ?? 18}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);
export const ArrowIcon = ({ size }: { size?: number }) => (
  <Icon size={size ?? 16}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const PlayIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 4l14 8-14 8Z" fill="currentColor" />
  </Icon>
);
export const GoogleIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export const QrIcon = ({ size }: { size?: number }) => (
  <Icon size={size ?? 18}>
    <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z" />
    <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
  </Icon>
);
