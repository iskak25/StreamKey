"use client";

import { useState } from "react";
import { api, errCode, messageFor } from "@/lib/client/api";
import { guestIdToken } from "@/lib/client/firebase";

/** Moves a paid ticket to this browser's session using the one-time recovery code shown after purchase. */
export default function RecoverClient({ signedIn }: { signedIn: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!signedIn) {
        const idToken = await guestIdToken();
        const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
        await api("/auth/session", { method: "POST", csrf: csrfToken, body: { idToken } });
      }
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      const r = await api<{ orderId: string }>("/orders/recover", { method: "POST", csrf: csrfToken, body: { code } });
      window.location.assign(`/orders/${r.orderId}`);
    } catch (err) {
      setError(errCode(err) === "NOT_FOUND" ? "Код не найден или уже использован." : errCode(err) === "IDEMPOTENCY_CONFLICT" ? "На этом аккаунте уже есть билет на этот концерт." : messageFor(errCode(err)));
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h1>Восстановить билет</h1>
      <p className="muted">Введите код восстановления, который вы сохранили после покупки.</p>
      <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={40} />
      <button className="btn" type="submit" disabled={busy || code.trim().length < 8} aria-busy={busy || undefined}>
        {busy ? "Проверяем…" : "Восстановить"}
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
