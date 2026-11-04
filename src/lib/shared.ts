import { supabase } from './supabase';
import { fetchMedia, type MediaRow } from './media';

export type SharedItem = { messageId: string; media: MediaRow; createdAt: string };
export type SharedLink = { key: string; url: string; host: string; createdAt: string };
export type SharedData = { photos: SharedItem[]; docs: SharedItem[]; links: SharedLink[]; bytes: number };

type MsgRow = { id: string; media_id: string | null; max_views: number | null; deleted_at: string | null; created_at: string };
type TextRow = { id: string; kind: string; body: string | null; created_at: string };

const PAGE = 500;
const MAX_PAGES = 10;
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const { data, error } = await build(p * PAGE, p * PAGE + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function fetchShared(conversationId: string): Promise<SharedData> {
  const [msgRows, textRows, sizeRows] = await Promise.all([
    pageAll<MsgRow>((a, b) =>
      supabase
        .from('messages')
        .select('id, media_id, max_views, deleted_at, created_at')
        .eq('conversation_id', conversationId)
        .not('media_id', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(a, b),
    ),
    pageAll<TextRow>((a, b) =>
      supabase
        .from('messages')
        .select('id, kind, body, created_at')
        .eq('conversation_id', conversationId)
        .in('kind', ['text', 'link'])
        .is('deleted_at', null)
        .ilike('body', '%http%')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(a, b),
    ),
    pageAll<{ size_bytes: number }>((a, b) =>
      supabase
        .from('media')
        .select('size_bytes')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(a, b),
    ),
  ]);

  // Photos with a view limit and deleted messages never show up here.
  const keep = msgRows.filter((m) => m.media_id && !m.deleted_at && !m.max_views);
  const ids = keep.map((m) => m.media_id as string);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
  const fetched = await Promise.all(chunks.map((ch) => fetchMedia(ch)));
  const byId = new Map<string, MediaRow>();
  fetched.forEach((rows) => rows.forEach((r) => byId.set(r.id, r)));

  const photos: SharedItem[] = [];
  const docs: SharedItem[] = [];
  for (const m of keep) {
    const media = byId.get(m.media_id as string);
    if (!media) continue;
    const item: SharedItem = { messageId: m.id, media, createdAt: m.created_at };
    if (media.kind === 'image') photos.push(item);
    else if (media.kind === 'file') docs.push(item);
  }

  const links: SharedLink[] = [];
  for (const t of textRows) {
    const found = (t.body ?? '').match(URL_RE) ?? [];
    for (const raw of found) {
      const url = raw.replace(/[.,;:!?)\]}]+$/, '');
      let host = '';
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        continue;
      }
      if (!host) continue;
      links.push({ key: t.id + ':' + links.length, url, host, createdAt: t.created_at });
    }
  }

  const bytes = sizeRows.reduce((sum, r) => sum + Number(r.size_bytes || 0), 0);
  return { photos, docs, links, bytes };
}
