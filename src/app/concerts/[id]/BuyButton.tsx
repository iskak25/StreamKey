"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errCode, isAuthError, messageFor } from "@/lib/client/api";

/**
 * Signed in: straight to the payment page. Not signed in: Google sign-in first, which
 * returns here with ?buy=1 and continues to payment automatically.
 */
export default function BuyButton({ concertId, ended, free, paidOrderId }: { concertId: string; ended: boolean; free: boolean; paidOrderId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  const buy = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      const r = await api<{ redirectUrl: string }>(`/concerts/${concertId}/checkout`, { method: "POST", csrf: csrfToken, body: {} });
      window.location.assign(r.redirectUrl);
    } catch (e) {
      if (isAuthError(e)) {
        window.location.assign(`/login?next=${encodeURIComponent(`/concerts/${concertId}?buy=1`)}`);
        return;
      }
      setError(errCode(e) === "TEMPORARY_UNAVAILABLE" ? "Онлайн-оплата пока недоступна. Попробуйте позже." : messageFor(errCode(e)));
      lock.current = false;
      setBusy(false);
    }
  }, [concertId]);

  useEffect(() => {
    if (ended || paidOrderId) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("buy") === "1") {
      // Drop the flag first: a failed attempt must not retry on every reload.
      window.history.replaceState(null, "", window.location.pathname);
      void buy();
    }
  }, [buy, ended, paidOrderId]);

  if (paidOrderId) {
    return (
      <div className="actions">
        {ended ? (
          <button className="btn" type="button" disabled>
            Концерт завершён
          </button>
        ) : (
          <Link href={`/orders/${paidOrderId}`} className="btn btn-brand link-reset" role="button">
            Смотреть
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="actions">
        <button className="btn btn-brand" type="button" onClick={buy} disabled={busy || ended}>
          {ended ? "Концерт завершён" : busy ? "Переходим к оплате…" : free ? "Получить билет" : "Оплатить"}
        </button>
      </div>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
