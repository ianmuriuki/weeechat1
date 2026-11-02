import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';
import { readBytes } from './media';

const BUCKET = 'avatars';
const cache = new Map<string, { url: string; exp: number }>();
const inflight = new Map<string, Promise<string>>();

export type PickedAvatar = { uri: string; width: number };

export function getAvatarUrl(path: string): Promise<string> {
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

export function useAvatarUrl(path?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!path) return;
    getAvatarUrl(path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

// Step one: choose and crop a square photo. Nothing is uploaded yet.
export async function pickAvatarImage(): Promise<PickedAvatar | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled) return null;
  return { uri: res.assets[0].uri, width: res.assets[0].width };
}

// Step two, after the person taps Save: shrink, upload and store the path on the profile.
export async function uploadAvatar(userId: string, picked: PickedAvatar, oldPath?: string | null): Promise<string> {
  const ctx = ImageManipulator.manipulate(picked.uri);
  if (picked.width > 512) ctx.resize({ width: 512 });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  const bytes = await readBytes(out.uri);
  const path = userId + '/' + Date.now() + '.jpg';
  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  if (oldPath) supabase.storage.from(BUCKET).remove([oldPath]).then(() => {}, () => {});
  return path;
}
