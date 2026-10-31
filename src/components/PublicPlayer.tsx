"use client";

import { useRef, useState } from "react";
import YouTubePlayer from "@/components/player/YouTubePlayer";
import type { PlayerHandle, PlayerVars } from "@/components/player/types";

const ERRORS: Record<number, string> = {
  0: "Не удалось загрузить плеер. Проверьте соединение и обновите страницу.",
  2: "Некорректный источник видео.",
  5: "Ошибка воспроизведения. Попробуйте обновить страницу.",
  100: "Видео удалено, недоступно или закрыто.",
  101: "Организатор запретил встраивание этого видео.",
  150: "Организатор запретил встраивание этого видео.",
  153: "Плеер не получил идентификацию клиента. Обновите страницу.",
};

/** YouTube's own player with its native controls (fullscreen, quality, volume), reused from the ticket watch page. */
export default function PublicPlayer({ videoId }: { videoId: string }) {
  const player = useRef<PlayerHandle>(null);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  // Same official IFrame API parameters as the protected page, but with YouTube's controls on.
  const vars: PlayerVars = { enablejsapi: 1, playsinline: 1, autoplay: 0, controls: 1, disablekb: 0, fs: 1, rel: 0, origin: typeof window === "undefined" ? "" : window.location.origin };

  return (
    <div className="stack">
      <div className="player-box">
        <YouTubePlayer
          key={key}
          ref={player}
          videoId={videoId}
          vars={vars}
          autoStartMuted
          onReady={() => setError(null)}
          onPlayingChange={() => {}}
          onError={(c) => setError(ERRORS[c] ?? ERRORS[5] ?? "")}
        />
      </div>
      <div className="actions">
        <button
          className="btn btn-secondary"
          type="button"
          aria-pressed={!muted}
          onClick={() => {
            player.current?.setMuted(!muted);
            if (muted) player.current?.play();
            setMuted(!muted);
          }}
        >
          {muted ? "Включить звук" : "Выключить звук"}
        </button>
      </div>
      {error && (
        <div className="stack">
          <p className="notice notice-error" role="alert">
            {error}
          </p>
          <div>
            <button className="btn btn-ghost" type="button" onClick={() => { setError(null); setKey((k) => k + 1); }}>
              Повторить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
