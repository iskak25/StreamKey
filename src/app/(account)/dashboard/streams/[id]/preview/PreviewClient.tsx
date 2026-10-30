"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errCode, isAuthError, organizerMessage } from "@/lib/client/api";
import MockPlayer from "@/components/player/MockPlayer";
import YouTubePlayer from "@/components/player/YouTubePlayer";
import type { PlayerHandle, PlayerVars } from "@/components/player/types";

interface Preview {
  title: string;
  status: string;
  mock: boolean;
  videoId: string | null;
  playerConfig: PlayerVars;
}

export default function PreviewClient({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const player = useRef<PlayerHandle>(null);

  useEffect(() => {
    api<Preview>(`/streams/${id}/preview`)
      .then(setData)
      .catch((e) => (isAuthError(e) ? router.replace("/login") : setError(organizerMessage(errCode(e)))));
  }, [id, router]);

  if (error)
    return (
      <p className="notice notice-error" role="alert">
        {error}
      </p>
    );
  if (!data) return <p className="muted">Загрузка…</p>;

  return (
    <div className="stack">
      <Link href={`/dashboard/streams/${id}`}>← К трансляции</Link>
      <p className="banner">Предпросмотр: так видит страницу зритель. Ссылка не расходуется и сессия не создаётся.</p>
      <h1>{data.title}</h1>
      <div className="player-box">
        {data.mock || !data.videoId ? (
          <MockPlayer ref={player} onPlayingChange={setPlaying} onError={() => {}} />
        ) : (
          <YouTubePlayer
            ref={player}
            videoId={data.videoId}
            vars={data.playerConfig}
            onPlayingChange={setPlaying}
            onError={(c) => setPlayerError(`Ошибка плеера (код ${c}). Проверьте настройки видео в YouTube Studio: Unlisted и разрешённое встраивание.`)}
          />
        )}
      </div>
      <div className="controls">
        <button className="btn" type="button" onClick={() => (playing ? player.current?.pause() : player.current?.play())} aria-pressed={playing}>
          {playing ? "Пауза" : "Play"}
        </button>
      </div>
      {data.mock && <p className="muted">Тестовый режим: воспроизведение YouTube выключено до подтверждения правил запуска (ADR-0001).</p>}
      {playerError && (
        <p className="notice notice-error" role="alert">
          {playerError}
        </p>
      )}
    </div>
  );
}
