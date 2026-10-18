const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract a YouTube video ID from a pasted URL. Supports
 * youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ and m./music. hosts.
 * Returns null for anything that isn't a recognizable YouTube video link.
 */
export function parseYouTubeId(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (ID_RE.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^music\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') candidate = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) candidate = m[2];
    }
  }
  return candidate && ID_RE.test(candidate) ? candidate : null;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

export function youtubeSearchUrl(exerciseName: string): string {
  const q = `how to ${exerciseName} proper form`.trim().split(/\s+/).map(encodeURIComponent).join('+');
  return `https://www.youtube.com/results?search_query=${q}`;
}
