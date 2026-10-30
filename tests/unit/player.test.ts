import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerHandle } from "@/components/player/types";
import { playerConfig } from "@/lib/shared/player";

// Exercise the API adapter without network requests or counting real YouTube views.
// This is not a substitute for real-device playback checks.
const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useImperativeHandle: (ref: { current: unknown }, create: () => unknown) => { ref.current = create(); },
}));

describe("YouTube API adapter", () => {
  let cleanup: void | (() => void);
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    hooks.effects.length = 0;
    vi.stubGlobal("document", { createElement: () => ({ remove: vi.fn() }), head: { appendChild: vi.fn() } });
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function mount() {
    const { default: Player } = await import("@/components/player/YouTubePlayer");
    const ref = { current: null as PlayerHandle | null };
    const callbacks = {
      onReady: vi.fn(), onPlayingChange: vi.fn(), onBufferingChange: vi.fn(),
      onPlaybackBlocked: vi.fn(), onEnded: vi.fn(), onError: vi.fn(),
    };
    Player({ ref, videoId: "testVideo01", vars: playerConfig("https://example.com"), ...callbacks });
    cleanup = hooks.effects[0]!();
    await Promise.resolve();
    await Promise.resolve();
    return { ref, callbacks };
  }

  it("uses official controls, forwards Play/Pause and destroys the player on unmount", async () => {
    const instance = { playVideo: vi.fn(), pauseVideo: vi.fn(), destroy: vi.fn() };
    const Constructor = vi.fn(function (_element: unknown, _options: unknown) { return instance; });
    vi.stubGlobal("window", { YT: { Player: Constructor } });
    const { ref } = await mount();
    expect(Constructor.mock.calls[0]?.[1]).toMatchObject({ playerVars: {
      controls: 0, disablekb: 1, fs: 0, playsinline: 1, enablejsapi: 1, rel: 0,
    } });
    ref.current!.play();
    ref.current!.pause();
    expect(instance.playVideo).toHaveBeenCalledOnce();
    expect(instance.pauseVideo).toHaveBeenCalledOnce();
    cleanup?.();
    cleanup = undefined;
    expect(instance.destroy).toHaveBeenCalledOnce();
  });

  it("reports buffering, playback blocks, end and errors; ignores events after unmount", async () => {
    type Events = { onReady(): void; onStateChange(e: { data: number }): void; onError(e: { data: number }): void; onAutoplayBlocked(): void };
    let events!: Events;
    vi.stubGlobal("window", { YT: { Player: function (_el: unknown, opts: { events: Events }) {
      events = opts.events;
      return { playVideo() {}, pauseVideo() {}, destroy() {} };
    } } });
    const { callbacks } = await mount();
    events.onReady();
    events.onStateChange({ data: 1 });
    events.onStateChange({ data: 3 });
    expect(callbacks.onPlayingChange).toHaveBeenLastCalledWith(true);
    expect(callbacks.onBufferingChange).toHaveBeenLastCalledWith(true);
    events.onAutoplayBlocked();
    events.onStateChange({ data: 0 });
    events.onError({ data: 150 });
    expect(callbacks.onPlaybackBlocked).toHaveBeenCalledOnce();
    expect(callbacks.onEnded).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith(150);
    cleanup?.();
    cleanup = undefined;
    events.onError({ data: 100 });
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
  });

  it("times out a stalled API download and allows a fresh attempt", async () => {
    vi.stubGlobal("window", {});
    const { callbacks } = await mount();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(callbacks.onError).toHaveBeenCalledWith(0);
    cleanup?.();
    hooks.effects.length = 0;
    await mount();
    expect(document.head.appendChild).toHaveBeenCalledTimes(2);
  });
});
