"use client";

import { useEffect, useImperativeHandle, useRef } from "react";
import type { PlayerHandle, PlayerProps, PlayerVars } from "./types";

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      width: string;
      height: string;
      playerVars: PlayerVars;
      events: { onReady(): void; onStateChange(e: { data: number }): void; onError(e: { data: number }): void; onAutoplayBlocked(): void };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the official IFrame API once (spec 2.1: official API only, no scraping of the stream). */
function loadIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    const s = document.createElement("script");
    const cleanup = () => {
      clearTimeout(timeout);
      s.onerror = null;
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = prev;
    };
    const fail = () => {
      cleanup();
      s.remove();
      apiPromise = null;
      reject(new Error("iframe_api"));
    };
    const ready = () => {
      if (!window.YT?.Player) return;
      cleanup();
      resolve(window.YT);
      prev?.();
    };
    const timeout = setTimeout(fail, 20_000);
    window.onYouTubeIframeAPIReady = ready;
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return apiPromise;
}

const YT_PLAYING = 1;

export default function YouTubePlayer({
  ref,
  videoId,
  vars,
  onReady,
  onPlayingChange,
  onBufferingChange,
  onPlaybackBlocked,
  onEnded,
  onError,
}: PlayerProps & { videoId: string; vars: PlayerVars }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const cb = useRef({ onReady, onPlayingChange, onError, onBufferingChange, onPlaybackBlocked, onEnded });
  cb.current = { onReady, onPlayingChange, onError, onBufferingChange, onPlaybackBlocked, onEnded };
  // Latest vars without making them an effect dependency: the player must not be rebuilt by a session re-check.
  const varsRef = useRef(vars);
  varsRef.current = vars;

  useImperativeHandle<PlayerHandle, PlayerHandle>(ref, () => ({
    play: () => player.current?.playVideo(),
    pause: () => player.current?.pauseVideo(),
  }));

  useEffect(() => {
    let cancelled = false;
    const readyTimeout = setTimeout(() => {
      if (!cancelled) cb.current.onError(0);
    }, 30_000);
    // The API replaces this node with the iframe, so give it a throwaway child.
    const mount = document.createElement("div");
    host.current?.appendChild(mount);

    loadIframeApi()
      .then((YT) => {
        if (cancelled) return;
        player.current = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: varsRef.current,
          events: {
            onReady: () => {
              clearTimeout(readyTimeout);
              if (!cancelled) cb.current.onReady?.();
            },
            onStateChange: (e) => {
              if (cancelled) return;
              cb.current.onBufferingChange?.(e.data === 3);
              if (e.data !== 3) cb.current.onPlayingChange(e.data === YT_PLAYING);
              if (e.data === 0) cb.current.onEnded?.();
            },
            onError: (e) => {
              clearTimeout(readyTimeout);
              if (!cancelled) cb.current.onError(e.data);
            },
            onAutoplayBlocked: () => {
              if (!cancelled) cb.current.onPlaybackBlocked?.();
            },
          },
        });
      })
      .catch(() => {
        clearTimeout(readyTimeout);
        if (!cancelled) cb.current.onError(0);
      });

    return () => {
      cancelled = true;
      clearTimeout(readyTimeout);
      player.current?.destroy();
      player.current = null;
      host.current?.replaceChildren();
    };
  }, [videoId]);

  return <div ref={host} className="player-fill" />;
}
