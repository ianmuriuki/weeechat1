import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTOS = 10;
const BUCKET = 'chat_media';

export type MediaRow = {
  id: string;
  conversation_id: string;
  uploader_id: string;
  storage_path: string;
  kind: 'image' | 'video' | 'audio' | 'file';
  mime_type: string;
  name: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  waveform: number[] | null;
  created_at: string;
};

export type Picked = {
  uri: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  kind: 'image' | 'audio' | 'file';
  data: Uint8Array;
  durationMs?: number;
  waveform?: number[];
};

// Phones can refuse one reader and allow another, so try both and report both if both fail.
export async function readBytes(uri: string): Promise<Uint8Array> {
  const tried: string[] = [];

  if (Platform.OS !== 'web') {
    try {
      const { File } = await import('expo-file-system');
      const b = await new File(uri).bytes();
      if (b.byteLength > 0) return b;
      tried.push('file system returned no data');
    } catch (e: any) {
      tried.push('file system: ' + (e?.message ?? String(e)));
    }
  }

  try {
    const res = await fetch(uri);
    const b = new Uint8Array(await res.arrayBuffer());
    if (b.byteLength > 0) return b;
    tried.push('fetch returned no data');
  } catch (e: any) {
    tried.push('fetch: ' + (e?.message ?? String(e)));
  }

  throw new Error("Couldn't read that file. " + tried.join('. '));
}

async function prepareImage(asset: ImagePicker.ImagePickerAsset): Promise<Picked> {
  // Resize and compress so the free 1 GB of storage lasts.
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width > 1600) ctx.resize({ width: 1600 });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  const data = await readBytes(out.uri);
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error('That photo came out damaged. Try again.');
  if (data.byteLength > MAX_BYTES) throw new Error('That photo is over 25 MB.');
  return {
    uri: out.uri,
    name: (asset.fileName ?? 'photo').replace(/\.[^.]+$/, '') + '.jpg',
    mime: 'image/jpeg',
    size: data.byteLength,
    width: out.width,
    height: out.height,
    kind: 'image',
    data,
  };
}

export async function pickFromGallery(onPrepare?: () => void): Promise<Picked[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_PHOTOS,
    quality: 1,
  });
  if (res.canceled) return [];
  onPrepare?.();
  const out: Picked[] = [];
  for (const asset of res.assets) out.push(await prepareImage(asset));
  return out;
}

export async function pickFromCamera(): Promise<Picked | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera access is off. Turn it on in your phone settings.');
  const res = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (res.canceled) return null;
  return prepareImage(res.assets[0]);
}

export async function pickDocument(): Promise<Picked | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (res.canceled) return null;
  const a = res.assets[0];
  if (a.size && a.size > MAX_BYTES) throw new Error('That file is over 25 MB.');
  const data = await readBytes(a.uri);
  if (data.byteLength > MAX_BYTES) throw new Error('That file is over 25 MB.');
  return {
    uri: a.uri,
    name: a.name,
    mime: a.mimeType ?? 'application/octet-stream',
    size: data.byteLength,
    width: null,
    height: null,
    kind: 'file',
    data,
  };
}

export async function uploadMedia(args: {
  conversationId: string;
  userId: string;
  mediaId: string;
  picked: Picked;
}): Promise<MediaRow> {
  const { conversationId, userId, mediaId, picked } = args;
  const rawExt = picked.kind === 'image' ? 'jpg' : (picked.name.split('.').pop() ?? 'bin');
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
  const path = conversationId + '/' + mediaId + '.' + ext;

  const up = await supabase.storage.from(BUCKET).upload(path, picked.data, { contentType: picked.mime, upsert: false });
  // On a retry the file may already be there, which is fine.
  if (up.error && !/already exists|duplicate/i.test(up.error.message)) throw up.error;

  const ins = await supabase
    .from('media')
    .insert({
      id: mediaId,
      conversation_id: conversationId,
      uploader_id: userId,
      storage_path: path,
      kind: picked.kind,
      mime_type: picked.mime,
      name: picked.name.slice(0, 255),
      size_bytes: picked.size,
      width: picked.width,
      height: picked.height,
      duration_ms: picked.durationMs ?? null,
      waveform: picked.waveform ?? null,
    })
    .select('*')
    .single();
  if (ins.error) {
    if (ins.error.code === '23505') {
      const existing = await supabase.from('media').select('*').eq('id', mediaId).single();
      if (existing.error) throw existing.error;
      return existing.data as MediaRow;
    }
    await supabase.storage.from(BUCKET).remove([path]);
    throw ins.error;
  }
  return ins.data as MediaRow;
}

export async function fetchMedia(ids: string[]): Promise<MediaRow[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('media').select('*').in('id', ids);
  if (error) throw error;
  return (data ?? []) as MediaRow[];
}

const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string>>();

export function getSignedUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now() + 60_000) return Promise.resolve(hit.url);
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = (async () => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) throw error ?? new Error('No URL');
    cache.set(path, { url: data.signedUrl, exp: Date.now() + 3_600_000 });
    return data.signedUrl;
  })().finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) return;
    getSignedUrl(path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}
