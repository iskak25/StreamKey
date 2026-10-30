export interface PlayerHandle {
  play(): void;
  pause(): void;
}

export interface PlayerProps {
  ref?: React.Ref<PlayerHandle>;
  onPlayingChange(playing: boolean): void;
  /** Raw YouTube error code (2, 5, 100, 101, 150, 153) or 0 for load failure. */
  onError(code: number): void;
}

export interface PlayerVars {
  enablejsapi: number;
  playsinline: number;
  autoplay: number;
  controls: number;
  rel: number;
  origin: string;
}
