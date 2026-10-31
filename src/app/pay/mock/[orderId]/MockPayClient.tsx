"use client";

import { useState } from "react";
import { api, errCode, isAuthError, messageFor } from "@/lib/client/api";

export default function MockPayClient({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      await api(`/orders/${orderId}/mock-pay`, { method: "POST", csrf: csrfToken, body: {} });
      window.location.assign(`/orders/${orderId}`);
    } catch (e) {
      if (isAuthError(e)) window.location.assign("/login");
      else {
        setError(messageFor(errCode(e)));
        setBusy(false);
      }
    }
  }

  return (
    <div className="card">
      <h1>Тестовая оплата</h1>
      <p className="muted">Это заглушка платёжной страницы: деньги не списываются. Настоящая оплата подключается отдельно.</p>
      <button className="btn" type="button" onClick={pay} disabled={busy}>
        {busy ? "Оплачиваем…" : "Оплатить (тест)"}
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
