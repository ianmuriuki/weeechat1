import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WallpaperPref = 'doodles' | 'plain';

const KEY = 'weeechat:wallpaper';
let current: WallpaperPref = 'doodles';
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((v) => {
      if ((v === 'plain' || v === 'doodles') && v !== current) {
        current = v;
        emit();
      }
    })
    .catch(() => {});
}

export function setWallpaper(v: WallpaperPref) {
  current = v;
  emit();
  AsyncStorage.setItem(KEY, v).catch(() => {});
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useWallpaper(): WallpaperPref {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => current, () => 'doodles' as WallpaperPref);
}
