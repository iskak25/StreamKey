"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import { localInputToIso, toLocalInput } from "@/lib/client/format";

export default function NewStreamClient() {
  const router = useRouter();
  const [now] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      const body = {
        title: String(f.get("title") ?? ""),
        description: String(f.get("description") ?? "") || undefined,
        youtube: String(f.get("youtube") ?? ""),
        accessStartsAt: localInputToIso(String(f.get("start"))),
        accessEndsAt: localInputToIso(String(f.get("end"))),
      };
      const created = await api<{ id: string }>("/streams", { method: "POST", csrf: csrfToken, body });
      router.push(`/dashboard/streams/${created.id}`);
    } catch (err) {
      if (isAuthError(err)) router.replace("/login");
      else setError(organizerMessage(errCode(err)));
      setBusy(false); // form state is kept: nothing the user typed is lost
    }
  }

  return (
    <div className="stack">
      <Link href="/dashboard">← Все трансляции</Link>
      <h1>Новая трансляция</h1>
      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="title">Название</label>
          <input id="title" name="title" required maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="youtube">Ссылка YouTube или ID видео</label>
          <input id="youtube" name="youtube" required placeholder="https://www.youtube.com/watch?v=…" autoComplete="off" />
          <span className="hint">
            Эфир создаёт и запускает сам организатор в YouTube Studio: доступ «Unlisted» с разрешённым встраиванием. Мы только проверяем
            формат ссылки, а не существование видео.
          </span>
        </div>
        <div className="field">
          <label htmlFor="description">Описание (необязательно)</label>
          <textarea id="description" name="description" rows={3} maxLength={2000} />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="start">Начало доступа</label>
            <input id="start" name="start" type="datetime-local" required defaultValue={toLocalInput(now)} />
          </div>
          <div className="field">
            <label htmlFor="end">Конец доступа</label>
            <input id="end" name="end" type="datetime-local" required defaultValue={toLocalInput(new Date(now.getTime() + 2 * 3_600_000))} />
          </div>
        </div>
        <span className="hint">Окно доступа — не более 7 суток. Время указывается в вашем часовом поясе.</span>
        <p className="notice">
          Видео остаётся обычным YouTube-роликом: ссылка на странице ограничивает доступ к нашей странице, но не защищает исходное видео от
          копирования и пересылки. После выдачи первой ссылки видео изменить нельзя.
        </p>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Создаём…" : "Создать трансляцию"}
        </button>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
