import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Mood } from '../components/weee/MoodFace';
import type { Cat } from './useWeeeData';

export type MePlan = { id: string; title: string; time: string; day: string; cat: Cat };
export type MeTask = { id: string; title: string; done: boolean };
export type MeCheckin = { mood: Mood; energy: string; note: string };

type PlanRow = { id: string; title: string; plan_time: string; plan_day: string; cat: Cat };
type TaskRow = { id: string; title: string; done_at: string | null };
type CheckinRow = { day: string; mood: Mood; energy: string; note: string };
type MoveRow = { day: string; minutes: number };

const SAVE_ERROR = "Couldn't save that. Check your connection and try again.";
const TABLES = ['me_plans', 'me_tasks', 'me_checkins', 'me_moves', 'me_habits'];

// Everything private to the signed in account. from and to are the first and last day of the week on screen.
export function useMeData(uid: string, from: string, to: string, today: string) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [checkinRows, setCheckinRows] = useState<CheckinRow[]>([]);
  const [moveRows, setMoveRows] = useState<MoveRow[]>([]);
  const [habitKeys, setHabitKeys] = useState<string[]>([]);
  const loaders = useRef<Record<string, () => Promise<void>>>({});
  const errTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function fail(message: string) {
    setError(SAVE_ERROR);
    clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(''), 6000);
    return message;
  }
  useEffect(() => () => clearTimeout(errTimer.current), []);

  async function loadPlans() {
    const { data, error: e } = await supabase.from('me_plans').select('id, title, plan_time, plan_day, cat').eq('user_id', uid).gte('plan_day', from).lte('plan_day', to).order('plan_time');
    if (!e) setPlanRows((data ?? []) as PlanRow[]);
  }
  async function loadTasks() {
    const { data, error: e } = await supabase.from('me_tasks').select('id, title, done_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(300);
    if (!e) setTaskRows((data ?? []) as TaskRow[]);
  }
  async function loadCheckins() {
    const { data, error: e } = await supabase.from('me_checkins').select('day, mood, energy, note').eq('user_id', uid).gte('day', from).lte('day', to);
    if (!e) setCheckinRows((data ?? []) as CheckinRow[]);
  }
  async function loadMoves() {
    const { data, error: e } = await supabase.from('me_moves').select('day, minutes').eq('user_id', uid).gte('day', from).lte('day', to);
    if (!e) setMoveRows((data ?? []) as MoveRow[]);
  }
  async function loadHabits() {
    const { data, error: e } = await supabase.from('me_habits').select('habit').eq('user_id', uid).eq('day', today);
    if (!e) setHabitKeys(((data ?? []) as { habit: string }[]).map((r) => r.habit));
  }
  async function loadAll() {
    await Promise.all([loadPlans(), loadTasks(), loadCheckins(), loadMoves(), loadHabits()]);
    setReady(true);
  }
  loaders.current = { all: loadAll, me_plans: loadPlans, me_tasks: loadTasks, me_checkins: loadCheckins, me_moves: loadMoves, me_habits: loadHabits };

  useEffect(() => {
    if (uid) loaders.current.all?.();
  }, [uid, from, to, today]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loaders.current.all?.();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    let ch: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<string>();
    const flush = () => {
      const names = Array.from(pending);
      pending.clear();
      names.forEach((n) => loaders.current[n]?.());
    };
    (async () => {
      const name = 'me:' + uid;
      const stale = supabase.getChannels().find((x) => x.topic === 'realtime:' + name);
      if (stale) await supabase.removeChannel(stale);
      if (!alive) return;
      let c = supabase.channel(name);
      for (const t of TABLES) {
        c = c.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
          pending.add(t);
          clearTimeout(timer);
          timer = setTimeout(flush, 200);
        });
      }
      c.subscribe((status) => {
        if (status === 'SUBSCRIBED') loaders.current.all?.();
      });
      ch = c;
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [uid]);

  const plans = useMemo<MePlan[]>(() => planRows.map((r) => ({ id: r.id, title: r.title, time: r.plan_time, day: r.plan_day, cat: r.cat })), [planRows]);
  const tasks = useMemo<MeTask[]>(() => taskRows.map((r) => ({ id: r.id, title: r.title, done: !!r.done_at })), [taskRows]);
  const checkins = useMemo(() => {
    const out: Record<string, MeCheckin> = {};
    for (const r of checkinRows) out[r.day] = { mood: r.mood, energy: r.energy, note: r.note };
    return out;
  }, [checkinRows]);
  const minutes = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of moveRows) out[r.day] = (out[r.day] ?? 0) + r.minutes;
    return out;
  }, [moveRows]);
  const habitsDone = useMemo(() => new Set(habitKeys), [habitKeys]);

  async function addPlan(p: { title: string; time: string; day: string; cat: Cat }): Promise<string | null> {
    const { data, error: e } = await supabase.from('me_plans').insert({ user_id: uid, title: p.title, plan_time: p.time, plan_day: p.day, cat: p.cat }).select('id, title, plan_time, plan_day, cat').single();
    if (e || !data) return fail(e?.message ?? 'no data');
    setPlanRows((l) => [...l, data as PlanRow]);
    return null;
  }
  async function deletePlan(id: string) {
    setPlanRows((l) => l.filter((r) => r.id !== id));
    const { error: e } = await supabase.from('me_plans').delete().eq('id', id);
    if (e) {
      fail(e.message);
      loaders.current.me_plans?.();
    }
  }
  async function addTask(title: string): Promise<string | null> {
    const { data, error: e } = await supabase.from('me_tasks').insert({ user_id: uid, title }).select('id, title, done_at').single();
    if (e || !data) return fail(e?.message ?? 'no data');
    setTaskRows((l) => [data as TaskRow, ...l]);
    return null;
  }
  async function completeTask(id: string) {
    const at = new Date().toISOString();
    setTaskRows((l) => l.map((r) => (r.id === id ? { ...r, done_at: at } : r)));
    const { error: e } = await supabase.from('me_tasks').update({ done_at: at }).eq('id', id);
    if (e) {
      fail(e.message);
      loaders.current.me_tasks?.();
    }
  }
  async function deleteTask(id: string) {
    setTaskRows((l) => l.filter((r) => r.id !== id));
    const { error: e } = await supabase.from('me_tasks').delete().eq('id', id);
    if (e) {
      fail(e.message);
      loaders.current.me_tasks?.();
    }
  }
  async function saveCheckin(day: string, mood: Mood, energy: string, note: string) {
    setCheckinRows((l) => [...l.filter((r) => r.day !== day), { day, mood, energy, note }]);
    const { error: e } = await supabase.rpc('save_my_checkin', { p_day: day, p_mood: mood, p_energy: energy, p_note: note });
    if (e) {
      fail(e.message);
      loaders.current.me_checkins?.();
    }
  }
  async function toggleHabit(habit: string, on: boolean) {
    setHabitKeys((l) => (on ? Array.from(new Set([...l, habit])) : l.filter((k) => k !== habit)));
    const { error: e } = on
      ? await supabase.from('me_habits').upsert({ user_id: uid, day: today, habit }, { onConflict: 'user_id,day,habit', ignoreDuplicates: true })
      : await supabase.from('me_habits').delete().eq('user_id', uid).eq('day', today).eq('habit', habit);
    if (e) {
      fail(e.message);
      loaders.current.me_habits?.();
    }
  }
  async function addMove(day: string, type: string, mins: number): Promise<string | null> {
    const { error: e } = await supabase.from('me_moves').insert({ user_id: uid, day, move_type: type, minutes: mins });
    if (e) return fail(e.message);
    loaders.current.me_moves?.();
    return null;
  }

  return { ready, error, plans, tasks, checkins, minutes, habitsDone, addPlan, deletePlan, addTask, completeTask, deleteTask, saveCheckin, toggleHabit, addMove };
}
