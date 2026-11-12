// GIFs and stickers come from GIPHY. The key is a public app key, set as EXPO_PUBLIC_GIPHY_KEY.
const KEY = process.env.EXPO_PUBLIC_GIPHY_KEY;
export const giphyReady = !!KEY;

export type GifPick = { kind: 'gif' | 'sticker'; url: string; w: number; h: number };
export type GifItem = { id: string; url: string; thumb: string; w: number; h: number; title: string };

export function isGiphyUrl(u: string) {
  return /^https:\/\/[a-z0-9.-]+\.giphy\.com\//.test(u);
}

// The picture of a GIF or sticker message, or null when the message is not one or its address is not GIPHY's.
export function parseGif(m: { kind: string; meta?: { u?: string; w?: number; h?: number } | null }) {
  if (m.kind !== 'gif' && m.kind !== 'sticker') return null;
  const u = m.meta?.u;
  if (!u || !isGiphyUrl(u)) return null;
  return { url: u, w: Number(m.meta?.w) || 200, h: Number(m.meta?.h) || 200 };
}

type Img = { url?: string; width?: string; height?: string };
function pick(images: Record<string, Img> | undefined, names: string[]): Img | null {
  for (const n of names) if (images?.[n]?.url) return images[n];
  return null;
}

export async function giphyFetch(kind: 'gif' | 'sticker', query: string, offset: number): Promise<{ items: GifItem[]; next: number | null }> {
  if (!KEY) throw new Error('not-configured');
  const base = 'https://api.giphy.com/v1/' + (kind === 'sticker' ? 'stickers' : 'gifs') + '/' + (query ? 'search' : 'trending');
  const url = base + '?api_key=' + encodeURIComponent(KEY) + '&limit=30&offset=' + offset + '&rating=pg-13' + (query ? '&lang=en&q=' + encodeURIComponent(query) : '');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('http-' + res.status);
    const json = await res.json();
    const items: GifItem[] = [];
    for (const g of json?.data ?? []) {
      const full = pick(g.images, kind === 'sticker' ? ['fixed_width', 'downsized', 'original'] : ['downsized', 'fixed_width', 'original']);
      const thumb = pick(g.images, ['fixed_width_small', 'fixed_width', 'downsized']);
      if (!full?.url || !thumb?.url || !isGiphyUrl(full.url)) continue;
      items.push({ id: String(g.id), url: full.url, thumb: thumb.url, w: Number(full.width) || 200, h: Number(full.height) || 200, title: String(g.title ?? '') });
    }
    const p = json?.pagination;
    const end = (p?.offset ?? offset) + (p?.count ?? items.length);
    return { items, next: p && end < (p.total_count ?? 0) ? end : null };
  } finally {
    clearTimeout(timer);
  }
}
