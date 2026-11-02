import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { clearActive, loadActive, pauseAlarms, saveActive, startAlarms, stopAlarms, type ActiveWorkout } from '../lib/workout';

// The one running workout. It lives on the page, not on the full screen, so leaving the screen never stops it.
export function useWorkoutSession(onLog: (minutes: number, type: string) => void) {
  const [active, setActive] = useState<ActiveWorkout | null>(null);
  const [done, setDone] = useState<{ type: string; minutes: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const logRef = useRef(onLog);
  logRef.current = onLog;
  const logged = useRef(0);
  const live = active != null;

  // Pick up a workout that was running when the app was closed.
  useEffect(() => {
    let alive = true;
    loadActive().then((a) => {
      if (!alive || !a) return;
      setActive(a);
      if (a.endsAt != null && a.endsAt > Date.now()) startAlarms(a.type, a.endsAt);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [live]);

  const total = active ? active.minutes * 60000 : 0;
  const left = active ? (active.endsAt != null ? Math.max(0, active.endsAt - now) : active.leftMs) : 0;
  const elapsed = Math.max(0, total - left);
  const running = !!active && active.endsAt != null;

  // Finished: log the full time once, even if the screen is hidden.
  useEffect(() => {
    if (!active || active.endsAt == null || left > 0 || logged.current === active.startedAt) return;
    logged.current = active.startedAt;
    clearActive();
    stopAlarms();
    logRef.current(active.minutes, active.type);
    setDone({ type: active.type, minutes: active.minutes });
    setActive(null);
  }, [active, left]);

  function start(type: string, minutes: number) {
    const t = Date.now();
    const endsAt = t + minutes * 60000;
    const a: ActiveWorkout = { type, minutes, startedAt: t, endsAt, leftMs: minutes * 60000 };
    setDone(null);
    setNow(t);
    setActive(a);
    saveActive(a);
    startAlarms(type, endsAt);
  }

  function pause() {
    if (!active || active.endsAt == null) return;
    const l = Math.max(0, active.endsAt - Date.now());
    const a = { ...active, endsAt: null, leftMs: l };
    setActive(a);
    saveActive(a);
    pauseAlarms(active.type, l);
  }

  function resume() {
    if (!active || active.endsAt != null) return;
    const e = Date.now() + active.leftMs;
    const a = { ...active, endsAt: e };
    setNow(Date.now());
    setActive(a);
    saveActive(a);
    startAlarms(active.type, e);
  }

  // Ends early and logs the whole minutes done so far.
  function stop() {
    const a = active;
    if (!a) return;
    const l = a.endsAt != null ? Math.max(0, a.endsAt - Date.now()) : a.leftMs;
    const mins = Math.floor((a.minutes * 60000 - l) / 60000);
    logged.current = a.startedAt;
    clearActive();
    stopAlarms();
    setActive(null);
    if (mins > 0) logRef.current(mins, a.type);
  }

  function dismissDone() {
    setDone(null);
  }

  return { active, done, left, elapsed, total, running, start, pause, resume, stop, dismissDone };
}

export type WorkoutSession = ReturnType<typeof useWorkoutSession>;
