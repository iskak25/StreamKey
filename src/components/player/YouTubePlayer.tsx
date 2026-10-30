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
      events: { onReady(): void; onStateChange(e: { data: number }): void; onError(e: { data: number }): void };
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
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => {
      apiPromise = null;
      reject(new Error("iframe_api"));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const YT_PLAYING = 1;

export default function YouTubePlayer({
  ref,
  videoId,
  vars,
  onPlayingChange,
  onError,
}: PlayerProps & { videoId: string; vars: PlayerVars }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const cb = useRef({ onPlayingChange, onError });
  cb.current = { onPlayingChange, onError };

  useImperativeHandle<PlayerHandle, PlayerHandle>(ref, () => ({
    play: () => player.current?.playVideo(),
    pause: () => player.current?.pauseVideo(),
  }));

  useEffect(() => {
    let cancelled = false;
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
          playerVars: vars,
          events: {
            onReady: () => {},
            onStateChange: (e) => cb.current.onPlayingChange(e.data === YT_PLAYING),
            onError: (e) => cb.current.onError(e.data),
          },
        });
      })
      .catch(() => cb.current.onError(0));

    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
      host.current?.replaceChildren();
    };
  }, [videoId, vars]);

  return <div ref={host} className="player-fill" />;
}
