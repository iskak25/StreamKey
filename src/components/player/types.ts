export interface PlayerHandle {
  play(): void;
  pause(): void;
}

export interface PlayerProps {
  ref?: React.Ref<PlayerHandle>;
  /** Fired once the underlying player can accept play/pause. */
  onReady?(): void;
  onPlayingChange(playing: boolean): void;
  onBufferingChange?(buffering: boolean): void;
  onPlaybackBlocked?(): void;
  onEnded?(): void;
  /** Raw YouTube error code (2, 5, 100, 101, 150, 153) or 0 for load failure. */
  onError(code: number): void;
}

export interface PlayerVars {
  enablejsapi: number;
  playsinline: number;
  autoplay: number;
  controls: number;
  disablekb: number;
  fs: number;
  rel: number;
  origin: string;
}
