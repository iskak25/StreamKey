"use client";

import { useImperativeHandle, useState } from "react";
import type { PlayerProps } from "./types";

/** Stand-in used while YouTube playback is disabled (ADR-0001). Loads nothing from YouTube. */
export default function MockPlayer({ ref, onPlayingChange }: PlayerProps) {
  const [playing, setPlaying] = useState(false);

  useImperativeHandle(ref, () => ({
    play() {
      setPlaying(true);
      onPlayingChange(true);
    },
    pause() {
      setPlaying(false);
      onPlayingChange(false);
    },
    setMuted() {},
    setVolume() {},
  }));

  return (
    <div className="player-fill mock" role="img" aria-label="Тестовый плеер">
      <span className="mock-state">{playing ? "▶ Воспроизведение (тест)" : "⏸ Пауза (тест)"}</span>
      <span>Тестовый режим: воспроизведение YouTube отключено до подтверждения правил запуска.</span>
    </div>
  );
}
