import Link from "next/link";

/** Round profile picture linking to the profile; falls back to the initial when the account has no photo. */
export default function Avatar({ photoUrl, name, href = "/profile" }: { photoUrl: string | null | undefined; name: string; href?: string }) {
  return (
    <Link href={href} className="avatar" aria-label="Профиль" title="Профиль">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" referrerPolicy="no-referrer" width={40} height={40} />
      ) : (
        <span aria-hidden="true">{(name.trim()[0] ?? "?").toUpperCase()}</span>
      )}
    </Link>
  );
}
