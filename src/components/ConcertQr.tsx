"use client";

import { useState } from "react";

/** "QR" button on a catalog card: builds a QR code of the concert page link, shown inline with a PNG download. */
export default function ConcertQr({ href, title }: { href: string; title: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function toggle() {
    if (open) return setOpen(false);
    if (!qr) {
      const { toDataURL } = await import("qrcode");
      setQr(await toDataURL(new URL(href, window.location.origin).toString(), { width: 512, margin: 2 }));
    }
    setOpen(true);
  }

  return (
    <div className="concert-qr">
      <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={toggle}>
        QR-код
      </button>
      {open && qr && (
        <div className="concert-qr-panel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR-код концерта «${title}»`} width={160} height={160} />
          <a className="btn btn-ghost btn-sm link-reset" role="button" href={qr} download={`qr-${href.split("/").pop()}.png`}>
            Скачать
          </a>
        </div>
      )}
    </div>
  );
}
