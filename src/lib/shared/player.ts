import type { PlayerVars } from "@/components/player/types";

/** Official IFrame API parameters only: our own Play/Pause replaces YouTube's controls. */
export const playerConfig = (origin: string): PlayerVars => ({
  enablejsapi: 1,
  playsinline: 1,
  autoplay: 0,
  controls: 0,
  disablekb: 1,
  fs: 0,
  rel: 0,
  origin,
});
