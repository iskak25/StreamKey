"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConcertCard from "@/components/ConcertCard";
import { api, ApiFail, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import {
  bishkekLocalToIso,
  concertPhase,
  isoToBishkekLocal,
  MAX_CONCERT_MS,
  MAX_PRICE_KGS,
  PUBLICATION_LABEL,
  type PublicationStatus,
} from "@/lib/shared/concerts";
import { parseYoutubeVideoId } from "@/lib/shared/youtube";

interface Concert {
  id: string;
  title: string;
  description: string;
  youtubeVideoId: string;
  priceKgs: number;
  startsAt: string;
  endsAt: string;
  publicationStatus: PublicationStatus;
  coverUrl: string | null;
  version: number;
}

const COVER_MAX_BYTES = 280_000;
const STEP_TITLES = ["YouTube", "Информация", "Публикация"];

/** Shrinks any picture to a JPEG under the server limit, entirely in the browser. */
async function shrinkToJpeg(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  let quality = 0.85;
  for (let i = 0; i < 12; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= COVER_MAX_BYTES) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(blob);
      });
      bitmap.close();
      return { blob, dataUrl };
    }
    quality = Math.max(0.5, quality - 0.1);
    scale *= 0.85;
  }
  bitmap.close();
  throw new Error("too-big");
}

function defaultStart(): string {
  const d = new Date(Date.now() + 24 * 3_600_000);
  return isoToBishkekLocal(new Date(Math.ceil(d.getTime() / 3_600_000) * 3_600_000).toISOString());
}

export default function ConcertWizard({ concertId }: { concertId?: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(!concertId);
  const [step, setStep] = useState(1);
  const [youtube, setYoutube] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => isoToBishkekLocal(new Date(Date.parse(bishkekLocalToIso(defaultStart())) + 3 * 3_600_000).toISOString()));
  const [existing, setExisting] = useState<Concert | null>(null);
  const [cover, setCover] = useState<{ blob: Blob; dataUrl: string } | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    if (!concertId) return;
    api<Concert>(`/admin/concerts/${concertId}`).then(
      (c) => {
        setExisting(c);
        setYoutube(c.youtubeVideoId);
        setTitle(c.title);
        setDescription(c.description);
        setPrice(String(c.priceKgs));
        setStart(isoToBishkekLocal(c.startsAt));
        setEnd(isoToBishkekLocal(c.endsAt));
        setLoaded(true);
      },
      (e) => {
        if (isAuthError(e)) router.replace("/login");
        else if (errCode(e) === "FORBIDDEN") router.replace("/dashboard");
        else setError(organizerMessage(errCode(e)));
      },
    );
  }, [concertId, router]);

  const videoId = parseYoutubeVideoId(youtube.trim());
  const priceNum = /^\d{1,7}$/.test(price.trim()) ? Number(price.trim()) : NaN;
  const startIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) ? bishkekLocalToIso(start) : null;
  const endIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end) ? bishkekLocalToIso(end) : null;

  const infoProblem =
    title.trim().length === 0
      ? "Укажите название"
      : Number.isNaN(priceNum) || priceNum > MAX_PRICE_KGS
        ? `Цена: целое число от 0 до ${MAX_PRICE_KGS}`
        : !startIso || !endIso
          ? "Укажите дату и время начала и окончания"
          : Date.parse(endIso) <= Date.parse(startIso)
            ? "Окончание должно быть позже начала"
            : Date.parse(endIso) - Date.parse(startIso) > MAX_CONCERT_MS
              ? "Длительность не более 7 суток"
              : null;

  async function pickCover(file: File | undefined) {
    setCoverError(null);
    if (!file) return;
    try {
      setCover(await shrinkToJpeg(file));
    } catch {
      setCover(null);
      setCoverError("Не удалось обработать картинку. Выберите JPEG, PNG или WebP.");
    }
  }

  async function save(publication: "keep" | "draft" | "published") {
    if (lock.current || infoProblem || !videoId || !startIso || !endIso) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const { csrfToken } = await api<{ csrfToken: string }>("/csrf");
      const fields = { title: title.trim(), description: description.trim(), youtube: videoId, priceKgs: priceNum, startsAt: startIso, endsAt: endIso };
      let id = existing?.id;
      if (id && existing) {
        await api(`/admin/concerts/${id}`, { method: "PATCH", csrf: csrfToken, body: { expectedVersion: existing.version, ...fields } });
      } else {
        id = (await api<Concert>("/admin/concerts", { method: "POST", csrf: csrfToken, body: fields })).id;
      }
      if (cover) {
        let res: Response;
        try {
          res = await fetch(`/api/v1/admin/concerts/${id}/cover`, {
            method: "PUT",
            headers: { "content-type": "image/jpeg", "x-csrf-token": csrfToken },
            body: cover.blob,
            credentials: "same-origin",
          });
        } catch {
          throw new ApiFail(0, "NETWORK");
        }
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
          throw new ApiFail(res.status, data?.error?.code ?? "UNKNOWN");
        }
      }
      const status = publication === "keep" ? null : publication;
      if (status && status !== existing?.publicationStatus) {
        await api(`/admin/concerts/${id}/publication`, { method: "POST", csrf: csrfToken, body: { status } });
      }
      router.push("/admin/concerts");
    } catch (e) {
      if (isAuthError(e)) router.replace("/login");
      else setError(organizerMessage(errCode(e)));
      setBusy(false);
    } finally {
      lock.current = false;
    }
  }

  if (!loaded) return error ? <p className="notice notice-error" role="alert">{error}</p> : <p className="muted">Загрузка…</p>;

  const previewCover = cover?.dataUrl ?? existing?.coverUrl ?? null;
  const previewStartMs = startIso ? Date.parse(startIso) : Date.now();
  const previewEndMs = endIso ? Date.parse(endIso) : previewStartMs;
  const isPublished = existing?.publicationStatus === "published";

  return (
    <div className="stack">
      <Link href="/admin/concerts">← Все концерты</Link>
      <h1>{existing ? "Редактирование концерта" : "Новый концерт"}</h1>
      <ol className="steps" aria-label="Шаги">
        {STEP_TITLES.map((t, i) => (
          <li key={t} aria-current={step === i + 1 ? "step" : undefined}>
            {i + 1}. {t}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="card stack">
          <div className="field">
            <label htmlFor="youtube">Ссылка на YouTube Live или ID видео</label>
            <input id="youtube" value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" autoComplete="off" />
            <span className="hint">
              Эфир создаётся в YouTube Studio с доступом «Unlisted» и разрешённым встраиванием. Мы проверяем только формат ссылки, а не то, что эфир идёт.
            </span>
          </div>
          {youtube.trim() !== "" && !videoId && (
            <p className="notice notice-error" role="alert">
              Не похоже на ссылку YouTube или 11-символьный ID видео.
            </p>
          )}
          {videoId && (
            <div className="stack">
              <span className="pill pill-ok">Видео распознано</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="yt-thumb" src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="Миниатюра видео" />
              <span className="hint">Это миниатюра с YouTube, видна только вам. Полный просмотр плеера доступен после сохранения черновика (кнопка «Просмотр» в списке).</span>
            </div>
          )}
          <div className="actions">
            <button className="btn" type="button" disabled={!videoId} onClick={() => setStep(2)}>
              Далее
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card stack">
          <div className="field">
            <label htmlFor="title">Название концерта</label>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
          </div>
          <div className="field">
            <label htmlFor="description">Описание</label>
            <textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </div>
          <div className="field">
            <label htmlFor="cover">Обложка (JPEG, PNG или WebP)</label>
            <input id="cover" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void pickCover(e.target.files?.[0])} />
            <span className="hint">Картинка автоматически уменьшается до 1280 px и сжимается до 280 КБ. Лучше всего подходит формат 16:9.</span>
            {coverError && (
              <p className="notice notice-error" role="alert">
                {coverError}
              </p>
            )}
            {previewCover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="cover-preview" src={previewCover} alt="Обложка" />
            )}
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="price">Цена билета, сом (KGS)</label>
              <input id="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              <span className="hint">0 — бесплатно. Оплата подключается следующим этапом.</span>
            </div>
            <div className="field">
              <span className="hint">Часовой пояс: Asia/Bishkek (UTC+6)</span>
            </div>
            <div className="field">
              <label htmlFor="start">Начало</label>
              <input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="end">Окончание</label>
              <input id="end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {infoProblem && <p className="hint" role="status">{infoProblem}</p>}
          <div className="actions">
            <button className="btn btn-ghost" type="button" onClick={() => setStep(1)}>
              Назад
            </button>
            <button className="btn" type="button" disabled={Boolean(infoProblem)} onClick={() => setStep(3)}>
              Далее
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <h2>Так концерт увидят на главной</h2>
          <div className="concert-grid">
            <ConcertCard
              concert={{
                id: "preview",
                title: title.trim(),
                description: description.trim().length > 160 ? `${description.trim().slice(0, 160)}…` : description.trim(),
                coverUrl: previewCover,
                priceKgs: Number.isNaN(priceNum) ? 0 : priceNum,
                startsAt: new Date(previewStartMs).toISOString(),
                phase: concertPhase(Date.now(), previewStartMs, previewEndMs),
              }}
              href={null}
            />
          </div>
          {existing && <p className="muted">Сейчас: {PUBLICATION_LABEL[existing.publicationStatus]}</p>}
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setStep(2)}>
              Назад
            </button>
            {existing ? (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => save("keep")}>
                {busy ? "Сохраняем…" : "Сохранить изменения"}
              </button>
            ) : (
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => save("draft")}>
                {busy ? "Сохраняем…" : "Сохранить как черновик"}
              </button>
            )}
            {!isPublished && (
              <button className="btn" type="button" disabled={busy} onClick={() => save("published")}>
                {busy ? "Публикуем…" : "Опубликовать на главной"}
              </button>
            )}
          </div>
        </div>
      )}
      {step !== 3 && error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
