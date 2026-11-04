import AsyncStorage from '@react-native-async-storage/async-storage';
import { canPush, ensureChannels, loadNotifications } from './push';

const KEY = 'weeez.workout';
const DAY = 24 * 60 * 60 * 1000;

// endsAt is set while the timer runs. leftMs is the time remaining while it is paused.
export type ActiveWorkout = { type: string; minutes: number; startedAt: number; endsAt: number | null; leftMs: number };

export async function saveActive(a: ActiveWorkout) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(a));
  } catch {}
}

export async function clearActive() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

export async function loadActive(): Promise<ActiveWorkout | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as ActiveWorkout;
    if (typeof a?.type !== 'string' || typeof a.minutes !== 'number' || typeof a.leftMs !== 'number' || typeof a.startedAt !== 'number') return null;
    if (Date.now() - a.startedAt > DAY) {
      await clearActive();
      return null;
    }
    return a;
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (ms: number) => pad(new Date(ms).getHours()) + ':' + pad(new Date(ms).getMinutes());

async function showRunning(type: string, body: string) {
  const N = await loadNotifications();
  await N.scheduleNotificationAsync({
    identifier: 'workout-running',
    content: { title: 'Workout running', body, sticky: true, data: { type: 'workout-running' } },
    trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: 'workout' },
  });
}

// Sets an ongoing notification and a finish alert, so the session keeps working with the app in the background.
export async function startAlarms(type: string, endsAt: number) {
  if (!canPush()) return;
  try {
    const N = await loadNotifications();
    await ensureChannels();
    await N.cancelScheduledNotificationAsync('workout-done').catch(() => {});
    await N.scheduleNotificationAsync({
      identifier: 'workout-done',
      content: { title: 'Workout finished', body: type + ' is done.', data: { type: 'workout-done' } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt), channelId: 'alerts' },
    });
    await showRunning(type, type + ', ends at ' + hhmm(endsAt));
  } catch (e) {
    console.warn('workout alarm failed', e);
  }
}

export async function pauseAlarms(type: string, leftMs: number) {
  if (!canPush()) return;
  try {
    const N = await loadNotifications();
    await N.cancelScheduledNotificationAsync('workout-done').catch(() => {});
    await showRunning(type, type + ', paused with ' + Math.max(1, Math.ceil(leftMs / 60000)) + ' min left');
  } catch (e) {
    console.warn('workout pause failed', e);
  }
}

export async function stopAlarms() {
  if (!canPush()) return;
  try {
    const N = await loadNotifications();
    await N.cancelScheduledNotificationAsync('workout-done').catch(() => {});
    await N.cancelScheduledNotificationAsync('workout-running').catch(() => {});
    await N.dismissNotificationAsync('workout-running').catch(() => {});
  } catch {}
}
