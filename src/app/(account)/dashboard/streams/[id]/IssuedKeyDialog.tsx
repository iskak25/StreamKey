"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Full secret invitation URL. Lives only in the parent's temporary state while this dialog is mounted. */
  url: string;
  label: string | null;
  onClose: () => void;
}

const SHARE_TEXT = "Ваша персональная ссылка для просмотра";

export default function IssuedKeyDialog({ url, label, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [handled, setHandled] = useState(false); // copied or sent at least once
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [instagramHint, setInstagramHint] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    // Native modal: focus trap, inert background, focus restored to the trigger on close.
    // Guarded because React dev mode runs effects twice; never closed from cleanup (that would fire "close").
    if (d && !d.open) d.showModal();
  }, []);

  /** Single exit: the native "close" event then clears the secret in the parent. */
  const closeDialog = () => dialog.current?.close();

  async function copy(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      setHandled(true);
      setConfirmLeave(false);
      return true;
    } catch {
      setCopyFailed(true);
      return false;
    }
  }

  async function instagram() {
    if (await copy()) setInstagramHint(true);
  }

  // Closing never happens automatically; leaving without copying needs a second, explicit step.
  function requestClose() {
    if (handled) closeDialog();
    else setConfirmLeave(true);
  }

  const markSent = () => {
    setHandled(true);
    setConfirmLeave(false);
  };

  const whatsapp =`https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT}: ${url}`)}`;
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(SHARE_TEXT)}`;

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="key-title"
      aria-describedby="key-warning"
      onCancel={(e) => {
        e.preventDefault(); // Esc goes through the same guarded path as the Close button
        requestClose();
      }}
      onClose={onClose}
    >
      <div className="stack">
        <div className="row">
          <h2 id="key-title">Новый ключ создан</h2>
          <span className="pill pill-ok">Готов к отправке</span>
        </div>
        {label && <p className="muted">Метка: {label}</p>}

        <div className="url-box" tabIndex={0} aria-label="Полная индивидуальная ссылка">
          {url}
        </div>

        <div className="share-grid">
          <a className="btn btn-ghost" href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={markSent}>
            WhatsApp
          </a>
          <a className="btn btn-ghost" href={telegram} target="_blank" rel="noopener noreferrer" onClick={markSent}>
            Telegram
          </a>
          <button className="btn btn-ghost" type="button" onClick={instagram}>
            Instagram
          </button>
          <button className="btn" type="button" onClick={copy}>
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </div>

        {instagramHint && (
          <p className="notice notice-ok" role="status">
            Ссылка скопирована. Откройте Instagram → Direct, выберите получателя и вставьте ссылку.
          </p>
        )}
        {copyFailed && (
          <p className="notice notice-error" role="alert">
            Не удалось скопировать автоматически. Выделите ссылку выше и скопируйте вручную.
          </p>
        )}

        <p id="key-warning" className="notice">
          Полный ключ показывается только один раз и нигде не сохраняется. После закрытия окна открыть его повторно нельзя. Если ключ нужно
          отправить ещё раз, отзовите эту ссылку и сгенерируйте новую.
        </p>

        {confirmLeave ? (
          <div className="stack" role="alert">
            <p className="notice notice-error">Вы не копировали и не отправляли ключ. Повторно открыть его будет нельзя.</p>
            <div className="actions">
              <button className="btn" type="button" onClick={() => setConfirmLeave(false)}>
                Вернуться
              </button>
              <button className="btn btn-danger" type="button" onClick={closeDialog}>
                Закрыть без копирования
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-ghost btn-block" type="button" onClick={requestClose}>
            Закрыть
          </button>
        )}
      </div>
    </dialog>
  );
}
