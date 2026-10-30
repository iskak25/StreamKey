"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiFail } from "@/lib/client/api";
import Logo from "@/components/Logo";
import { googleIdToken } from "@/lib/client/firebase";

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

export default function LoginClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const idToken = await googleIdToken();
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      await api("/auth/session", { method: "POST", csrf: csrfToken, body: { idToken } });
      router.replace("/dashboard");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <Logo width={200} plate />
      <h1>Вход для организаторов</h1>
      <p>Войдите через Google, чтобы создавать трансляции и выдавать приглашения.</p>
      <p className="muted">Зрителям вход не нужен: достаточно открыть присланную ссылку-приглашение.</p>
      <button className="btn" type="button" onClick={signIn} disabled={busy}>
        {busy ? "Входим…" : "Войти через Google"}
      </button>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
