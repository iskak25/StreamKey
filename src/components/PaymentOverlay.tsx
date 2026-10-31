"use client";

import { createPortal } from "react-dom";

/** Full-screen skeleton shown while the payment is being prepared; stays until the browser leaves for the payment page. */
export default function PaymentOverlay({ text = "Подготовка оплаты…" }: { text?: string }) {
  return createPortal(
    <div className="pay-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="pay-overlay-inner">
        <div className="skeleton pay-overlay-cover" aria-hidden="true" />
        <div className="skeleton skeleton-line pay-overlay-line" aria-hidden="true" />
        <div className="skeleton skeleton-line pay-overlay-line short" aria-hidden="true" />
        <div className="skeleton pay-overlay-btn" aria-hidden="true" />
        <p className="muted">{text}</p>
      </div>
    </div>,
    document.body,
  );
}
