"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiFail, messageFor, prepareViewer } from "@/lib/client/api";
import Logo from "@/components/Logo";

const TOKEN_IN_HASH = /^#t=([A-Za-z0-9_-]{43})$/;

export default function InviteClient() {
  const router = useRouter();
  // The secret lives only in memory: never in storage, logs or URLs.
  const tokenRef = useRef<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const m = TOKEN_IN_HASH.exec(window.location.hash);
    if (m?.[1]) tokenRef.current = m[1];
    // Strip the fragment before anything else can read it (strict-mode safe: tokenRef survives).
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setHasToken(tokenRef.current !== null);
  }, []);

  async function start() {
    const token = tokenRef.current;
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const csrf = await prepareViewer();
      const { cookie } = await api<{ cookie: boolean }>("/viewer/context");
      if (!cookie) throw new ApiFail(0, "COOKIES"); // link is not spent
      const { watchPath } = await api<{ watchPath: string }>("/viewer/activate", { method: "POST", csrf, body: { token } });
      tokenRef.current = null;
      router.push(watchPath);
    } catch (e) {
      setError(messageFor(e instanceof ApiFail ? e.code : "UNKNOWN"));
      setBusy(false); // token kept: a retry with the same browser is safe and idempotent
    }
  }

  if (hasToken === null) return <p className="muted">Загрузка…</p>;

  if (!hasToken) {
    return (
      <div className="card">
        <h1>Приглашение</h1>
        <p>Ссылка-приглашение не найдена на этой странице.</p>
        <p className="muted">
          Откройте приглашение по исходной ссылке целиком. Если вы уже обновляли страницу, адрес очищается из соображений безопасности:
          откройте исходную ссылку заново.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <Logo width={200} plate />
      <h1>Приглашение на трансляцию</h1>
      <p>Доступ закрепится за этим браузером. Не очищайте cookies до окончания просмотра.</p>
      <p className="muted">Ссылка одноразовая: после нажатия она будет привязана к этому браузеру и не откроется в другом.</p>
      <button className="btn" type="button" onClick={start} disabled={busy}>
        {busy ? "Подключаем…" : "Начать просмотр"}
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
