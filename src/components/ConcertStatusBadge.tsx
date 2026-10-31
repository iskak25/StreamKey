import { PHASE_LABEL, type ConcertPhase } from "@/lib/shared/concerts";

/** Live is red and pulses; soon is amber; ended is neutral. Colour is never the only signal: the label is always there. */
export default function ConcertStatusBadge({ phase }: { phase: ConcertPhase }) {
  const cls = phase === "live" ? "pill badge-live" : phase === "soon" ? "pill pill-warn" : "pill";
  return <span className={cls}>{phase === "live" ? "LIVE" : PHASE_LABEL[phase]}</span>;
}
