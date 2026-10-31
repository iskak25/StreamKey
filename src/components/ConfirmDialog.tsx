"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native <dialog> (focus trap, Esc and backdrop for free). A bottom sheet on phones, see dialog.modal in globals.css. */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Отмена",
  danger = false,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault(); // let the parent own the state
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel(); // backdrop click
      }}
    >
      <div className="stack">
        <h2 id="confirm-title">{title}</h2>
        {children && <div className="muted">{children}</div>}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={`btn${danger ? " btn-danger" : ""}`} type="button" onClick={onConfirm} aria-busy={busy || undefined} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
