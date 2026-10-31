"use client";

import { useEffect, useRef, useState } from "react";

const PNG_WIDTH = 1024; // print quality: ~8.7 cm at 300 dpi
const QR_OPTIONS = { errorCorrectionLevel: "Q", margin: 4, color: { dark: "#000000", light: "#ffffff" } } as const;

/**
 * QR code of the public concert page (never the protected stream): preview, PNG/SVG download, copy link.
 * The code depends only on the page URL, so it stays the same until that URL changes.
 */
export default function ConcertQr({ concertId, title, open, onClose }: { concertId: string; title: string; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [png, setPng] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open || png) return;
    const link = new URL(`/concerts/${concertId}`, window.location.origin).toString();
    setUrl(link);
    (async () => {
      try {
        const qr = await import("qrcode");
        const [p, s] = await Promise.all([qr.toDataURL(link, { ...QR_OPTIONS, width: PNG_WIDTH }), qr.toString(link, { ...QR_OPTIONS, type: "svg" })]);
        setPng(p);
        setSvg(URL.createObjectURL(new Blob([s], { type: "image/svg+xml" })));
      } catch {
        setFailed(true);
      }
    })();
  }, [open, png, concertId]);

  useEffect(() => () => { if (svg) URL.revokeObjectURL(svg); }, [svg]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="qr-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="stack">
        <h2 id="qr-title">QR-код концерта</h2>
        <p className="muted">«{title}». Код ведёт на страницу концерта: зритель сначала купит билет, затем получит доступ к просмотру.</p>
        <div className="qr-preview">
          {png ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={png} alt={`QR-код концерта «${title}»`} width={240} height={240} />
          ) : (
            <div className="skeleton qr-skeleton" aria-hidden="true" />
          )}
        </div>
        {url && <p className="meta qr-url">{url}</p>}
        {failed && (
          <p className="notice notice-error" role="alert">
            Не удалось выполнить действие. Повторите попытку.
          </p>
        )}
        <div className="actions">
          {png && (
            <a className="btn btn-sm link-reset" role="button" href={png} download={`streamkey-${concertId}.png`}>
              Скачать PNG
            </a>
          )}
          {svg && (
            <a className="btn btn-sm link-reset" role="button" href={svg} download={`streamkey-${concertId}.svg`}>
              Скачать SVG
            </a>
          )}
          <button className="btn btn-secondary btn-sm" type="button" onClick={copy} disabled={!url}>
            {copied ? "Ссылка скопирована" : "Копировать ссылку"}
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </dialog>
  );
}
