"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFail, messageFor, prepareViewer } from "@/lib/client/api";
import MockPlayer from "@/components/player/MockPlayer";
import YouTubePlayer from "@/components/player/YouTubePlayer";
import type { PlayerHandle, PlayerVars } from "@/components/player/types";

interface Access {
  title: string;
  mock: boolean;
  videoId: string | null;
  playerConfig: PlayerVars;
  serverTime: string;
  leaseUntil: string;
}

type Phase = "loading" | "ready" | "reconnecting" | "denied";

const HEARTBEAT_MS = 60_000;
const JITTER_MS = 10_000;
const RETRY_MS = 5_000;
const SEEN_MS = 5 * 60_000;
// Definitive server answers: stop immediately instead of riding out the lease.
const STOP_STATUSES = new Set([401, 403, 404, 410]);

const PLAYER_ERRORS: Record<number, string> = {
  0: "Не удалось загрузить плеер.",
  2: "Некорректный источник видео или ошибка воспроизведения.",
  5: "Ошибка воспроизведения. Попробуйте обновить страницу.",
  100: "Видео удалено, недоступно или закрыто.",
  101: "Организатор запретил встраивание этого видео.",
  150: "Организатор запретил встраивание этого видео.",
  153: "Плеер не получил идентификацию клиента. Обновите страницу.",
};

export default function WatchClient({ linkId }: { linkId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [access, setAccess] = useState<Access | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerKey, setPlayerKey] = useState(0); // bumped only by the explicit "retry" button
  const screen = useRef<HTMLElement>(null);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);

  useEffect(() => {
    setFullscreenAvailable(Boolean(document.fullscreenEnabled));
    const changed = () => setFullscreen(document.fullscreenElement === screen.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  const player = useRef<PlayerHandle>(null);
  const phaseRef = useRef<Phase>("loading");
  const leaseEnd = useRef(0); // local-clock deadline, derived from server time to avoid skew
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const csrf = useRef<string | null>(null);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const check = useCallback(async () => {
    if (phaseRef.current === "denied") return;
    try {
      const a = await api<Access>(`/viewer/access?linkId=${encodeURIComponent(linkId)}`);
      leaseEnd.current = Date.now() + (Date.parse(a.leaseUntil) - Date.parse(a.serverTime));
      setAccess((prev) => (prev && prev.videoId === a.videoId && prev.title === a.title ? prev : a)); // never rebuild the player on a heartbeat
      setPhaseBoth("ready");
    } catch (e) {
      if (e instanceof ApiFail && STOP_STATUSES.has(e.status)) {
        setErrorCode(e.code);
        setPhaseBoth("denied");
      } else if (Date.now() >= leaseEnd.current) {
        setPhaseBoth("reconnecting"); // lease over: iframe is destroyed until the server confirms again
      }
    }
  }, [linkId, setPhaseBoth]);

  // Heartbeat loop: 60 s ± 10 s while healthy, quicker retries while reconnecting.
  useEffect(() => {
    let stopped = false;
    const loop = async () => {
      await check();
      if (stopped || phaseRef.current === "denied") return;
      const delay = phaseRef.current === "reconnecting" ? RETRY_MS : HEARTBEAT_MS + (Math.random() * 2 - 1) * JITTER_MS;
      timer.current = setTimeout(loop, delay);
    };
    void loop();

    // Enforce the lease locally even if the network is down or timers were throttled.
    const guard = setInterval(() => {
      if (phaseRef.current === "ready" && Date.now() >= leaseEnd.current) setPhaseBoth("reconnecting");
    }, 2_000);

    const recheck = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("online", recheck);

    return () => {
      stopped = true;
      clearTimeout(timer.current);
      clearInterval(guard);
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("online", recheck);
    };
  }, [check, setPhaseBoth]);

  // The player unmounts while offline and a fresh one is built on reconnect: it must report ready again.
  useEffect(() => {
    if (phase !== "ready") {
      setPlayerReady(false);
      setPlaying(false);
      setBuffering(false);
      setPlaybackBlocked(false);
      setEnded(false);
      setPlayerError(null);
    }
  }, [phase]);

  // Coarse activity hint (server throttles writes to once per 5 min anyway).
  useEffect(() => {
    if (phase !== "ready") return;
    const send = async () => {
      try {
        csrf.current ??= await prepareViewer();
        await api("/viewer/seen", { method: "POST", csrf: csrf.current, body: { linkId } });
      } catch {
        csrf.current = null; // best effort only
      }
    };
    void send();
    const id = setInterval(send, SEEN_MS);
    return () => clearInterval(id);
  }, [phase, linkId]);

  if (phase === "denied") {
    return (
      <div className="card page-narrow">
        <h1>Просмотр недоступен</h1>
        <p role="alert">{messageFor(errorCode ?? "FORBIDDEN")}</p>
      </div>
    );
  }

  if (phase === "loading" || !access) return <p className="muted" role="status">{phase === "reconnecting" ? "Нет связи с сервером. Повторяем подключение…" : "Проверяем доступ…"}</p>;

  const showPlayer = phase === "ready";
  const realPlayer = !access.mock && !!access.videoId;
  const canPlay = showPlayer && (!realPlayer || (playerReady && !playerError));

  return (
    <section className="watch-screen" ref={screen} aria-label="Просмотр трансляции">
      <div className="watch-stage">
      <div className="player-box">
        {showPlayer &&
          (access.mock || !access.videoId ? (
            <MockPlayer ref={player} onPlayingChange={setPlaying} onError={() => {}} />
          ) : (
            <YouTubePlayer
              key={playerKey}
              ref={player}
              videoId={access.videoId}
              vars={access.playerConfig}
              onPlayingChange={(value) => {
                setPlaying(value);
                if (value) {
                  setPlaybackBlocked(false);
                  setEnded(false);
                }
              }}
              onEnded={() => setEnded(true)}
              onBufferingChange={setBuffering}
              onPlaybackBlocked={() => {
                setPlaying(false);
                setBuffering(false);
                setPlaybackBlocked(true);
              }}
              onReady={() => {
                setPlayerError(null);
                setPlayerReady(true);
              }}
              onError={(c) => {
                setPlayerReady(false);
                setPlaying(false);
                setBuffering(false);
                setPlayerError(PLAYER_ERRORS[c] ?? PLAYER_ERRORS[5] ?? "");
              }}
            />
          ))}
        {!showPlayer && (
          <div className="player-fill mock">
            <span className="mock-state">Восстановление соединения…</span>
            <span>После восстановления связи нажмите Play для продолжения.</span>
          </div>
        )}
      </div>
      </div>

      <div className="controls watch-controls">
        <button
          className="btn"
          type="button"
          disabled={!canPlay}
          onClick={() => (playing ? player.current?.pause() : player.current?.play())}
          aria-pressed={playing}
        >
          {playing ? "Пауза" : "Play"}
        </button>
        <span className="status muted" aria-live="polite">
          {!showPlayer ? "Нет связи с сервером" : playerError ? "Ошибка плеера" : realPlayer && !playerReady ? "Загрузка плеера…" : buffering ? "Буферизация…" : playbackBlocked ? "Нажмите Play ещё раз" : ended ? "Воспроизведение завершено" : ""}
        </span>
        {fullscreenAvailable && (
          <button className="btn watch-fullscreen" type="button" aria-label={fullscreen ? "Выйти из полного экрана" : "На весь экран"}
            title={fullscreen ? "Выйти из полного экрана" : "На весь экран"}
            onClick={async () => {
              setFullscreenError(false);
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await screen.current?.requestFullscreen();
              } catch { setFullscreenError(true); }
            }}>
            <span aria-hidden="true">{fullscreen ? "↙" : "⛶"}</span>
          </button>
        )}
      </div>

      {fullscreenError && <p className="watch-message" role="status">Браузер не разрешил полноэкранный режим.</p>}
      {playerError && (
        <p className="notice notice-error" role="alert">
          {playerError}
        </p>
      )}
      {playerError && (
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            setPlayerError(null);
            setPlayerReady(false);
            setPlaying(false);
            setBuffering(false);
            setPlaybackBlocked(false);
            setEnded(false);
            setPlayerKey((k) => k + 1);
          }}
        >
          Повторить
        </button>
      )}
    </section>
  );
}
