const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

export function isVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

/** Parses a YouTube URL or bare video ID locally; never fetches anything. */
export function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (isVideoId(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  let candidate: string | null = null;
  if (host === "youtu.be") {
    candidate = url.pathname.split("/")[1] ?? null;
  } else if (url.pathname === "/watch") {
    candidate = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/live/")) {
    candidate = url.pathname.split("/")[2] ?? null;
  }
  return candidate && isVideoId(candidate) ? candidate : null;
}
