"use client";

import { useEffect, useRef, useState } from "react";
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

const WATCHDOG_MS = 2000;

/**
 * YouTube's own player with its native controls, reused from the ticket watch page.
 * Playback starts from the viewer's click, so it starts WITH sound: a muted autoplay that is unmuted later can be
 * muted again by the browser. A watchdog notices if sound is lost anyway and says so instead of staying silent.
 */
export default function PublicPlayer({ videoId }: { videoId: string }) {
  const player = useRef<PlayerHandle>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lostSound, setLostSound] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  // Same official IFrame API parameters as the protected page, but with YouTube's controls on.
  const vars: PlayerVars = { enablejsapi: 1, playsinline: 1, autoplay: 0, controls: 1, disablekb: 0, fs: 1, rel: 0, origin: typeof window === "undefined" ? "" : window.location.origin };

  // While the viewer wants sound, keep it: unmute again if something muted the player; if it keeps being muted, say so.
  useEffect(() => {
    if (!started || muted) return;
    let strikes = 0;
    const id = setInterval(() => {
      const p = player.current;
      if (!p?.isMuted?.()) {
        strikes = 0;
        setLostSound(false);
        return;
      }
      p.setMuted(false);
      if (++strikes >= 2) setLostSound(true);
    }, WATCHDOG_MS);
    return () => clearInterval(id);
  }, [started, muted]);

  function start() {
    // A click is a user gesture: start with sound.
    player.current?.setMuted(false);
    player.current?.setVolume(100);
    player.current?.play();
    setMuted(false);
    setLostSound(false);
    setStarted(true);
  }

  function toggleSound() {
    const next = !muted;
    player.current?.setMuted(next);
    if (!next) {
      player.current?.setVolume(100);
      player.current?.play();
    }
    setMuted(next);
    setLostSound(false);
  }

  return (
    <div className="stack">
      <div className="player-box">
        <YouTubePlayer
          key={key}
          ref={player}
          videoId={videoId}
          vars={vars}
          onReady={() => {
            setError(null);
            setReady(true);
          }}
          onPlayingChange={() => {}}
          onError={(c) => setError(ERRORS[c] ?? ERRORS[5] ?? "")}
        />
        {!started && !error && (
          <button className="player-start" type="button" onClick={start} disabled={!ready} aria-busy={!ready || undefined}>
            {ready ? "Смотреть трансляцию" : "Загрузка плеера…"}
          </button>
        )}
      </div>
      {started && (
        <div className="actions">
          <button className="btn btn-secondary" type="button" aria-pressed={!muted} onClick={toggleSound}>
            {muted ? "Включить звук" : "Выключить звук"}
          </button>
          {lostSound && (
            <span className="muted" role="status">
              Браузер выключил звук. Нажмите кнопку на плеере или «Выключить звук» и «Включить звук» ещё раз.
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="stack">
          <p className="notice notice-error" role="alert">
            {error}
          </p>
          <div>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setError(null);
                setReady(false);
                setStarted(false);
                setKey((k) => k + 1);
              }}
            >
              Повторить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
