import AsyncStorage from '@react-native-async-storage/async-storage';

// Small on-phone copy of the chat list and recent messages, so the app opens and reads without a connection.
const k = (name: string) => 'weeez.cache.' + name;

export async function readCache<T>(name: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(k(name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache(name: string, value: unknown) {
  AsyncStorage.setItem(k(name), JSON.stringify(value)).catch(() => {});
}

export async function clearCaches() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((x) => x.startsWith('weeez.cache.')));
  } catch {}
}
