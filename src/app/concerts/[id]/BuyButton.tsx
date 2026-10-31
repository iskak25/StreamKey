"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errCode, isAuthError, messageFor } from "@/lib/client/api";
import PaymentOverlay from "@/components/PaymentOverlay";
import { guestIdToken } from "@/lib/client/firebase";

/** Silent guest session: an anonymous Firebase user exchanged for our session cookie. The viewer sees no sign-in step. */
async function startGuestSession(): Promise<void> {
  const idToken = await guestIdToken();
  const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
  await api("/auth/session", { method: "POST", csrf: csrfToken, body: { idToken } });
}

/**
 * Straight to the payment page; without an account a guest session is created silently first.
 * Google sign-in is optional (and returns here with ?buy=1 to continue). Only the instance with
 * autoStart continues automatically, so the phone bar and the desktop card never start two checkouts.
 */
export default function BuyButton({
  concertId,
  ended,
  free,
  signedIn,
  paidOrderId,
  autoStart = false,
  block = false,
}: {
  concertId: string;
  ended: boolean;
  free: boolean;
  signedIn: boolean;
  paidOrderId: string | null;
  autoStart?: boolean;
  block?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const size = `btn btn-lg${block ? " btn-block" : ""}`;

  const buy = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const checkout = async () => {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      return api<{ redirectUrl: string }>(`/concerts/${concertId}/checkout`, { method: "POST", csrf: csrfToken, body: {} });
    };
    try {
      if (!signedIn) await startGuestSession();
      let r;
      try {
        r = await checkout();
      } catch (e) {
        if (!isAuthError(e) || !signedIn) throw e;
        await startGuestSession(); // the session cookie expired: renew it silently
        r = await checkout();
      }
      window.location.assign(r.redirectUrl);
    } catch (e) {
      if (isAuthError(e) || (e as { code?: string } | null)?.code === "auth/needs-google") {
        window.location.assign(`/login?next=${encodeURIComponent(`/concerts/${concertId}?buy=1`)}`);
        return;
      }
      const fbCode = (e as { code?: string } | null)?.code;
      if (typeof fbCode === "string" && fbCode.startsWith("auth/")) {
        // Firebase refused the silent guest session (typically: Anonymous sign-in is off in the project).
        console.error("guest session failed:", fbCode);
        setError(`Покупка без входа сейчас недоступна. Войдите через Google или попробуйте позже. (${fbCode})`);
        lock.current = false;
        setBusy(false);
        return;
      }
      setError(errCode(e) === "TEMPORARY_UNAVAILABLE" ? "Онлайн-оплата пока недоступна. Попробуйте позже." : messageFor(errCode(e)));
      lock.current = false;
      setBusy(false);
    }
  }, [concertId, signedIn]);

  useEffect(() => {
    if (!autoStart || ended || paidOrderId) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("buy") === "1") {
      // Drop the flag first: a failed attempt must not retry on every reload.
      window.history.replaceState(null, "", window.location.pathname);
      void buy();
    }
  }, [autoStart, buy, ended, paidOrderId]);

  if (ended) {
    return (
      <button className={size} type="button" disabled>
        Концерт завершён
      </button>
    );
  }
  if (paidOrderId) {
    return (
      <Link href={`/orders/${paidOrderId}`} className={size}>
        Смотреть
      </Link>
    );
  }

  const label = busy ? "Подготовка оплаты…" : free ? "Получить билет" : "Купить билет";
  return (
    <>
      {busy && <PaymentOverlay />}
      <button className={size} type="button" onClick={buy} aria-busy={busy || undefined} disabled={busy}>
        {label}
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
