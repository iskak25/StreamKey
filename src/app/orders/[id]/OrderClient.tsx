"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PaymentOverlay from "@/components/PaymentOverlay";
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
  guest: boolean;
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
  const [lostSession, setLostSession] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const lock = useRef(false);

  // No session (guest session lost or expired): offer Google sign-in or the recovery code instead of a dead end.
  const toLogin = useCallback(() => setLostSession(true), []);

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

  /** Back to the payment page (the same pending payment is reused server-side). */
  async function pay() {
    if (!order || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      const r = await api<{ redirectUrl: string }>(`/concerts/${order.concertId}/checkout`, { method: "POST", csrf: csrfToken, body: {} });
      window.location.assign(r.redirectUrl);
    } catch (e) {
      setError(messageFor(errCode(e)));
      lock.current = false;
      setBusy(false);
    }
  }

  async function showCode() {
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      setCode((await api<{ code: string }>(`/orders/${orderId}/recovery`, { method: "POST", csrf: csrfToken, body: {} })).code);
    } catch (e) {
      setError(messageFor(errCode(e)));
    }
  }

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
      {busy && order && !order.paid && <PaymentOverlay text="Открываем оплату…" />}
      <h1>Ваш билет</h1>
      {lostSession && (
        <>
          <p>Не удалось найти ваш билет в этом браузере. Если вы покупали без входа, а данные браузера были очищены, восстановите билет по коду.</p>
          <p className="actions">
            <Link href="/recover" className="btn link-reset" role="button">
              Восстановить по коду
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/orders/${orderId}`)}`} className="btn btn-ghost link-reset" role="button">
              Войти через Google
            </Link>
          </p>
        </>
      )}
      {!order && !error && !lostSession && <p className="muted">Проверяем оплату…</p>}
      {order && !order.paid && <p className="muted">Ожидание оплаты ({formatPrice(order.amountKgs)}). Оплатите QR-код в приложении банка: страница обновится сама, ничего нажимать не нужно.</p>}
      {order && !order.paid && (
        <button className="btn" type="button" onClick={pay} disabled={busy}>
          {busy ? "Открываем оплату…" : "Перейти к оплате"}
        </button>
      )}
      {order?.paid && !order.claimed && !error && <p className="muted">Оплата подтверждена. Открываем трансляцию…</p>}
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
      {order?.paid && order.guest && (
        <div className="stack">
          <hr className="divider" />
          {code ? (
            <>
              <p>
                Код восстановления: <strong>{code}</strong>
              </p>
              <p className="muted">Сохраните его. Он показывается один раз и нужен, если вы потеряете доступ к этому браузеру.</p>
            </>
          ) : (
            <button className="btn btn-ghost" type="button" onClick={showCode}>
              Сохранить билет на случай потери доступа
            </button>
          )}
          <Link href="/login" className="muted">
            Или войдите через Google: билет закрепится за аккаунтом.
          </Link>
        </div>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
