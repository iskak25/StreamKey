"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errCode, isAuthError, messageFor } from "@/lib/client/api";
import { formatPrice } from "@/lib/shared/concerts";

interface Order {
  id: string;
  concertId: string;
  status: "PENDING" | "PAID" | "FAILED";
  amountKgs: number;
  paid: boolean;
  claimed: boolean;
  linkId: string | null;
}

const POLL_MS = 3000;
const POLL_LIMIT = 100; // about 5 minutes

/**
 * Return page after payment: waits for the payment to be confirmed, then
 * takes the buyer straight to their personal link (the invite page).
 */
export default function OrderClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const toLogin = useCallback(() => window.location.assign(`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`), [orderId]);

  const claim = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      const r = await api<{ url: string }>(`/orders/${orderId}/access`, { method: "POST", csrf: csrfToken, body: {} });
      window.location.assign(r.url);
    } catch (e) {
      if (isAuthError(e)) return toLogin();
      setError(messageFor(errCode(e)));
      lock.current = false;
      setBusy(false);
    }
  }, [orderId, toLogin]);

  useEffect(() => {
    let stopped = false;
    let tries = 0;
    async function tick() {
      try {
        const o = await api<Order>(`/orders/${orderId}`);
        if (stopped) return;
        setOrder(o);
        if (o.paid) {
          if (!o.claimed) void claim();
          return;
        }
      } catch (e) {
        if (stopped) return;
        if (isAuthError(e)) return toLogin();
        setError(messageFor(errCode(e)));
        return;
      }
      if (++tries < POLL_LIMIT) setTimeout(tick, POLL_MS);
    }
    void tick();
    return () => {
      stopped = true;
    };
  }, [orderId, claim, toLogin]);

  return (
    <div className="card">
      <h1>Ваш билет</h1>
      {!order && !error && <p className="muted">Загрузка…</p>}
      {order && !order.paid && <p className="muted">Ждём подтверждения оплаты ({formatPrice(order.amountKgs)}). Страница обновится сама.</p>}
      {order?.paid && !order.claimed && !error && <p className="muted">Оплата получена. Открываем трансляцию…</p>}
      {order?.paid && order.claimed && (
        <>
          <p>Билет оплачен. Ссылка на трансляцию уже выдавалась.</p>
          {order.linkId && (
            <p>
              <Link href={`/watch/${order.linkId}`} className="btn link-reset" role="button">
                Продолжить просмотр
              </Link>
            </p>
          )}
          <p className="muted">Просмотр продолжается в том браузере, где вы открыли ссылку. Если нужна новая ссылка (другой браузер или устройство), получите её ниже: прежняя ссылка и привязка к браузеру перестанут работать.</p>
          <button className="btn btn-ghost" type="button" onClick={claim} disabled={busy}>
            {busy ? "Выдаём…" : "Получить новую ссылку"}
          </button>
        </>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
