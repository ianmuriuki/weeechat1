import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Mood } from '../components/weee/MoodFace';

export type Cat = 'other' | 'date' | 'errand' | 'workout' | 'study' | 'trip';
export type Who = 'us' | 'me' | 'you';
export type Plan = { id: string; title: string; time: string; day: string; who: Who; cat: Cat };
export type Task = { id: string; title: string; owner: 'mine' | 'yours' | 'ours'; priv: boolean; done: boolean; doneByMe: boolean };
export type Checkin = { mood: Mood; energy: string; note: string };
export type Answer = { user_id: string; day: string; question: string; body: string };

type PlanRow = { id: string; created_by: string; title: string; plan_time: string; plan_day: string; who: 'both' | 'creator' | 'partner'; cat: Cat };
type TaskRow = { id: string; created_by: string; title: string; assignee: 'creator' | 'partner' | 'both'; is_private: boolean; done_by: string | null; done_at: string | null; created_at: string };
type CheckinRow = { user_id: string; day: string; mood: Mood; energy: string; note: string };
type MoveRow = { id: string; user_id: string; day: string; move_type: string; minutes: number };

const NUDGE_MS = 10 * 60 * 1000;
const SAVE_ERROR = "Couldn't save that. Check your connection and try again.";
const PLAN_COLS = 'id, created_by, title, plan_time, plan_day, who, cat';
const TASK_COLS = 'id, created_by, title, assignee, is_private, done_by, done_at, created_at';
const TABLES = ['weee_plans', 'weee_tasks', 'weee_checkins', 'weee_moves', 'me_habits', 'weee_answers', 'weee_settings', 'weee_nudges'];

function parseDay(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// All shared state for the Wee page. cid is the conversation of the active Wee link. from and to are the first and last day of the week on screen, today is the device date.
export function useWeeeData(uid: string, from: string, to: string, today: string, cid: string | null) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [planRows, setPlanRows] = useState<PlanRow[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [checkinRows, setCheckinRows] = useState<CheckinRow[]>([]);
  const [moveRows, setMoveRows] = useState<MoveRow[]>([]);
  const [habitKeys, setHabitKeys] = useState<string[]>([]);
  const [answerRows, setAnswerRows] = useState<Answer[]>([]);
  const [togetherDay, setTogetherDay] = useState<string | null>(null);
  const [lastNudge, setLastNudge] = useState<number | null>(null);
  const [, bump] = useState(0);
  const loaders = useRef<Record<string, () => Promise<void>>>({});
  const errTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sending = useRef(false);

  function fail(message: string) {
    setError(SAVE_ERROR);
    clearTimeout(errTimer.current);
    errTimer.current = setTimeout(() => setError(''), 6000);
    return message;
  }
  useEffect(() => () => clearTimeout(errTimer.current), []);

  async function loadPlans() {
    if (!cid) return;
    const { data, error: e } = await supabase.from('weee_plans').select(PLAN_COLS).eq('conversation_id', cid).gte('plan_day', from).lte('plan_day', to).order('plan_time');
    if (!e) setPlanRows((data ?? []) as PlanRow[]);
  }
  async function loadTasks() {
    if (!cid) return;
    const { data, error: e } = await supabase.from('weee_tasks').select(TASK_COLS).eq('conversation_id', cid).order('created_at', { ascending: false }).limit(300);
    if (!e) setTaskRows((data ?? []) as TaskRow[]);
  }
  async function loadCheckins() {
    if (!cid) return;
    const { data, error: e } = await supabase.from('weee_checkins').select('user_id, day, mood, energy, note').eq('conversation_id', cid).gte('day', from).lte('day', to);
    if (!e) setCheckinRows((data ?? []) as CheckinRow[]);
  }
  async function loadMoves() {
    if (!cid) return;
    const { data, error: e } = await supabase.from('weee_moves').select('id, user_id, day, move_type, minutes').eq('conversation_id', cid).gte('day', from).lte('day', to);
    if (!e) setMoveRows((data ?? []) as MoveRow[]);
  }
  async function loadHabits() {
    if (!uid) return;
    const { data, error: e } = await supabase.from('me_habits').select('habit').eq('user_id', uid).eq('day', today);
    if (!e) setHabitKeys(((data ?? []) as { habit: string }[]).map((r) => r.habit));
  }
  async function loadAnswers() {
    if (!cid) return;
    const { data, error: e } = await supabase.from('weee_answers').select('user_id, day, question, body').eq('conversation_id', cid).eq('day', today);
    if (!e) setAnswerRows((data ?? []) as Answer[]);
  }
  async function loadSettings() {
    if (!cid) return;
    const { data, error: e } = await supabase.from('weee_settings').select('together_since').eq('conversation_id', cid).maybeSingle();
    if (!e) setTogetherDay((data as { together_since: string | null } | null)?.together_since ?? null);
  }
  async function loadNudge() {
    if (!cid || !uid) return;
    const { data, error: e } = await supabase.from('weee_nudges').select('created_at').eq('conversation_id', cid).eq('sender_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!e) setLastNudge(data ? new Date((data as { created_at: string }).created_at).getTime() : null);
  }
  async function loadAll() {
    await Promise.all([loadPlans(), loadTasks(), loadCheckins(), loadMoves(), loadHabits(), loadAnswers(), loadSettings(), loadNudge()]);
    setReady(true);
  }

  loaders.current = {
    all: loadAll,
    weee_plans: loadPlans,
    weee_tasks: loadTasks,
    weee_checkins: loadCheckins,
    weee_moves: loadMoves,
    me_habits: loadHabits,
    weee_answers: loadAnswers,
    weee_settings: loadSettings,
    weee_nudges: loadNudge,
  };

  // Reload when the conversation, the week or the day changes.
  useEffect(() => {
    if (cid && uid) loaders.current.all?.();
  }, [cid, uid, from, to, today]);

  // Reload when the app wakes up.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loaders.current.all?.();
    });
    return () => sub.remove();
  }, []);

  // Any change to a weee table triggers a short delayed reload of that table. Row security decides what arrives.
  useEffect(() => {
    if (!cid) return;
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
      const name = 'weee:' + cid;
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
  }, [cid]);

  // Re-render when the nudge cooldown ends, so the button comes back on time.
  const nudgeUntil = lastNudge ? lastNudge + NUDGE_MS : null;
  useEffect(() => {
    if (!nudgeUntil) return;
    const ms = nudgeUntil - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => bump((n) => n + 1), ms + 50);
    return () => clearTimeout(t);
  }, [nudgeUntil]);

  // ---------- shapes the page uses, always from the point of view of the signed in user
  const plans = useMemo<Plan[]>(
    () =>
      planRows.map((r) => ({
        id: r.id,
        title: r.title,
        time: r.plan_time,
        day: r.plan_day,
        cat: r.cat,
        who: r.who === 'both' ? 'us' : (r.who === 'creator') === (r.created_by === uid) ? 'me' : 'you',
      })),
    [planRows, uid],
  );

  const tasks = useMemo<Task[]>(
    () =>
      taskRows.map((r) => {
        const mine = r.created_by === uid;
        const owner = r.assignee === 'both' ? 'ours' : (r.assignee === 'creator') === mine ? 'mine' : 'yours';
        return { id: r.id, title: r.title, owner, priv: r.is_private, done: !!r.done_at, doneByMe: r.done_by === uid };
      }),
    [taskRows, uid],
  );

  const checkins = useMemo(() => {
    const out: Record<string, { me?: Checkin; partner?: Checkin }> = {};
    for (const r of checkinRows) {
      const c: Checkin = { mood: r.mood, energy: r.energy, note: r.note };
      const cur = out[r.day] ?? {};
      if (r.user_id === uid) cur.me = c;
      else cur.partner = c;
      out[r.day] = cur;
    }
    return out;
  }, [checkinRows, uid]);

  const { myMinutes, partnerMinutes } = useMemo(() => {
    const mine: Record<string, number> = {};
    const theirs: Record<string, number> = {};
    for (const r of moveRows) {
      const t = r.user_id === uid ? mine : theirs;
      t[r.day] = (t[r.day] ?? 0) + r.minutes;
    }
    return { myMinutes: mine, partnerMinutes: theirs };
  }, [moveRows, uid]);

  const habitsDone = useMemo(() => new Set(habitKeys), [habitKeys]);
  const answers = useMemo(
    () => ({ mine: answerRows.find((a) => a.user_id === uid) ?? null, partner: answerRows.find((a) => a.user_id !== uid) ?? null }),
    [answerRows, uid],
  );
  const togetherSince = useMemo(() => (togetherDay ? parseDay(togetherDay) : null), [togetherDay]);

  // ---------- actions. Each returns null on success or an error message.
  async function addPlan(p: { title: string; time: string; day: string; who: Who; cat: Cat }): Promise<string | null> {
    if (!cid) return fail('not ready');
    const { data, error: e } = await supabase
      .from('weee_plans')
      .insert({
        conversation_id: cid,
        created_by: uid,
        title: p.title,
        plan_time: p.time,
        plan_day: p.day,
        who: p.who === 'us' ? 'both' : p.who === 'me' ? 'creator' : 'partner',
        cat: p.cat,
      })
      .select(PLAN_COLS)
      .single();
    if (e || !data) return fail(e?.message ?? 'no data');
    setPlanRows((l) => [...l, data as PlanRow]);
    return null;
  }

  async function deletePlan(id: string) {
    setPlanRows((l) => l.filter((r) => r.id !== id));
    const { error: e } = await supabase.from('weee_plans').delete().eq('id', id);
    if (e) {
      fail(e.message);
      loaders.current.weee_plans?.();
    }
  }

  async function addTask(t: { title: string; owner: 'mine' | 'yours' | 'ours'; priv: boolean }): Promise<string | null> {
    if (!cid) return fail('not ready');
    const { data, error: e } = await supabase
      .from('weee_tasks')
      .insert({
        conversation_id: cid,
        created_by: uid,
        title: t.title,
        assignee: t.owner === 'mine' ? 'creator' : t.owner === 'yours' ? 'partner' : 'both',
        is_private: t.priv && t.owner === 'mine',
      })
      .select(TASK_COLS)
      .single();
    if (e || !data) return fail(e?.message ?? 'no data');
    setTaskRows((l) => [data as TaskRow, ...l]);
    return null;
  }

  async function completeTask(id: string) {
    const at = new Date().toISOString();
    setTaskRows((l) => l.map((r) => (r.id === id ? { ...r, done_by: uid, done_at: at } : r)));
    const { error: e } = await supabase.from('weee_tasks').update({ done_by: uid, done_at: at }).eq('id', id);
    if (e) {
      fail(e.message);
      loaders.current.weee_tasks?.();
    }
  }

  async function deleteTask(id: string) {
    setTaskRows((l) => l.filter((r) => r.id !== id));
    const { error: e } = await supabase.from('weee_tasks').delete().eq('id', id);
    if (e) {
      fail(e.message);
      loaders.current.weee_tasks?.();
    }
  }

  async function saveCheckin(day: string, mood: Mood, energy: string, note: string) {
    if (!cid) return;
    setCheckinRows((l) => [...l.filter((r) => !(r.user_id === uid && r.day === day)), { user_id: uid, day, mood, energy, note }]);
    const { error: e } = await supabase.rpc('save_checkin', { p_conversation: cid, p_day: day, p_mood: mood, p_energy: energy, p_note: note });
    if (e) {
      fail(e.message);
      loaders.current.weee_checkins?.();
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

  async function addMove(day: string, type: string, minutes: number): Promise<string | null> {
    if (!cid) return fail('not ready');
    const { error: e } = await supabase.from('weee_moves').insert({ conversation_id: cid, user_id: uid, day, move_type: type, minutes });
    if (e) return fail(e.message);
    loaders.current.weee_moves?.();
    return null;
  }

  async function sendNudge(): Promise<string | null> {
    if (!cid || sending.current) return 'busy';
    sending.current = true;
    try {
      const { error: e } = await supabase.from('weee_nudges').insert({ conversation_id: cid, sender_id: uid });
      if (e) {
        if (/cooldown/i.test(e.message)) loaders.current.weee_nudges?.();
        else fail(e.message);
        return e.message;
      }
      setLastNudge(Date.now());
      loaders.current.weee_nudges?.();
      return null;
    } finally {
      sending.current = false;
    }
  }

  async function saveTogether(day: string): Promise<string | null> {
    if (!cid) return fail('not ready');
    const { error: e } = await supabase.rpc('save_together_since', { p_conversation: cid, p_date: day });
    if (e) return fail(e.message);
    setTogetherDay(day);
    return null;
  }

  async function saveAnswer(day: string, question: string, body: string): Promise<string | null> {
    if (!cid) return fail('not ready');
    const { error: e } = await supabase.from('weee_answers').insert({ conversation_id: cid, user_id: uid, day, question, body });
    if (e) return fail(e.message);
    loaders.current.weee_answers?.();
    return null;
  }

  return {
    ready, error, plans, tasks, checkins, myMinutes, partnerMinutes, habitsDone, togetherSince, nudgeUntil, answers,
    addPlan, deletePlan, addTask, completeTask, deleteTask, saveCheckin, toggleHabit, addMove, sendNudge, saveTogether, saveAnswer,
  };
}
