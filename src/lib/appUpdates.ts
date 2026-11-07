import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const COOLDOWN_MS = 5 * 60 * 1000;
const LAUNCH_WINDOW_MS = 20 * 1000;

// Looks for a published update when the app opens and every time it returns to the foreground.
// Right after launch a found update is applied at once. Later it is only downloaded and applies on the next
// launch, so the app never reloads while someone is typing a message.
export function useAppUpdates() {
  const last = useRef(0);
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let alive = true;
    const started = Date.now();
    const run = async () => {
      if (Date.now() - last.current < COOLDOWN_MS) return;
      last.current = Date.now();
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        await Updates.fetchUpdateAsync();
        if (alive && Date.now() - started < LAUNCH_WINDOW_MS) await Updates.reloadAsync();
      } catch {
        // No network or no update server: the app keeps running the version it has.
      }
    };
    void run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void run();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
}
