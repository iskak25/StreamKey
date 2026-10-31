"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiFail } from "@/lib/client/api";
import { googleIdToken } from "@/lib/client/firebase";
import { GoogleIcon } from "@/components/icons";

function errorText(e: unknown): string {
  if (e instanceof ApiFail) {
    if (e.code === "FORBIDDEN") return "Вход недоступен: аккаунт заблокирован или запрос отклонён.";
    if (e.code === "NETWORK") return "Нет связи с сервером.";
    return "Не удалось войти. Повторите попытку.";
  }
  const code = (e as { code?: string } | null)?.code;
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "Окно входа было закрыто.";
  if (code === "auth/popup-blocked") return "Браузер заблокировал окно входа. Разрешите всплывающие окна.";
  return "Не удалось войти через Google. Повторите попытку.";
}

export default function LoginClient({ next }: { next: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buying = next?.startsWith("/concerts/") ?? false;

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const idToken = await googleIdToken();
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      await api("/auth/session", { method: "POST", csrf: csrfToken, body: { idToken } });
      router.replace(next ?? "/");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <div className="stack">
        <h1>{buying ? "Войдите, чтобы купить билет" : "Вход в StreamKey"}</h1>
        <p className="muted">
          {buying ? "После входа вы вернётесь к концерту, и оплата начнётся сразу." : "Войдите через Google, чтобы покупать билеты и смотреть трансляции."}
        </p>
      </div>
      <button className="btn btn-google btn-lg btn-block" type="button" onClick={signIn} aria-busy={busy || undefined} disabled={busy}>
        <GoogleIcon />
        {busy ? "Входим…" : "Продолжить с Google"}
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">Мы получаем только имя, email и фото вашего Google-аккаунта. Пароль остаётся у Google.</p>
    </div>
  );
}
