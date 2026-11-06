import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../lib/icons';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { IconButton } from '../Primitives';
import { StatusBarCover } from '../StatusBarCover';
import { Chip, WeeeSheet } from './WeeeSheet';
import { MoveSession } from './MoveSession';
import { MoodFace, type Mood } from './MoodFace';
import { CupsSpot } from './Spots';
import { Card, Reveal } from './Card';
import { CATS, DURATIONS, HABITS, MOODS, MoodTile, Segmented, Tag, WORKOUTS, clockOf, fmt12, keyOf, pad } from './WeeePage';
import { BLOCK_INK, moodFill, onBlock, useWeee, type Weee } from '../../theme/weee';
import { font } from '../../theme/type';
import { useMeData } from '../../hooks/useMeData';
import type { Cat } from '../../hooks/useWeeeData';
import { useWorkoutSession } from '../../hooks/useWorkoutSession';

// Your own space. Nothing here is shared with anyone, whoever you chat with.
export function MePage() {
  const { w, isDark } = useWeee();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const wide = width > 820;
  const tone = (name: keyof Weee) => {
    const fg = onBlock(name, isDark);
    return { fg, tile: fg === '#ffffff' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.4)', line: fg + '59' };
  };

  const [me, setMe] = useState<{ display_name: string } | null>(null);
  useEffect(() => {
    if (!uid) return;
    supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle().then(({ data }) => setMe((data as any) ?? null));
  }, [uid]);

  // Today comes from the device clock. It refreshes every minute, at local midnight and when the app wakes up.
  const [, setTick] = useState(0);
  const now = new Date();
  const todayKey = keyOf(now);
  useEffect(() => {
    const refresh = () => setTick((n) => n + 1);
    const n = new Date();
    const msToMidnight = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime() + 1000;
    const midnight = setTimeout(refresh, msToMidnight);
    const minute = setInterval(refresh, 60000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(midnight);
      clearInterval(minute);
      sub.remove();
    };
  }, [todayKey]);

  const days = useMemo(() => {
    const t = new Date();
    const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      return { d, key: keyOf(d), name: d.toLocaleDateString(undefined, { weekday: 'short' }), num: d.getDate() };
    });
  }, [todayKey]);

  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    setPicked(null);
  }, [todayKey]);
  const found = days.findIndex((d) => d.key === (picked ?? todayKey));
  const sel = found >= 0 ? found : Math.max(0, days.findIndex((d) => d.key === todayKey));
  const selDay = days[sel];

  const data = useMeData(uid, days[0].key, days[6].key, todayKey);
  const mood: Mood | null = data.checkins[todayKey]?.mood ?? null;
  const [energy, setEnergy] = useState('steady');
  const [note, setNote] = useState('');
  const syncedFor = useRef('');
  useEffect(() => {
    if (!data.ready || syncedFor.current === todayKey) return;
    syncedFor.current = todayKey;
    const mine = data.checkins[todayKey];
    setEnergy(mine?.energy ?? 'steady');
    setNote(mine?.note ?? '');
  }, [data.ready, data.checkins, todayKey]);

  const [sheet, setSheet] = useState<null | 'plan' | 'move'>(null);
  const [pTitle, setPTitle] = useState('');
  const [pTime, setPTime] = useState('19:30');
  const [pCat, setPCat] = useState<Cat>('other');
  const [pErr, setPErr] = useState('');
  const [mType, setMType] = useState('Walk');
  const [mMin, setMMin] = useState(15);
  const [mCustom, setMCustom] = useState('');
  const [mErr, setMErr] = useState('');
  const [taskText, setTaskText] = useState('');
  const [showDone, setShowDone] = useState(false);
  const workout = useWorkoutSession((done, kind) => {
    data.addMove(todayKey, kind, done);
  });
  const [sessionOpen, setSessionOpen] = useState(false);

  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = me?.display_name?.trim();
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  const dayPlans = data.plans.filter((p) => p.day === selDay.key).sort((a, b) => a.time.localeCompare(b.time));
  const openTasks = data.tasks.filter((t) => !t.done);
  const doneTasks = data.tasks.filter((t) => t.done);
  const nextPlan = dayPlans.find((p) => selDay.key !== todayKey || p.time >= pad(now.getHours()) + ':' + pad(now.getMinutes())) ?? dayPlans[0];
  const weekMinutes = days.reduce((s, d) => s + (data.minutes[d.key] ?? 0), 0);
  const maxMin = Math.max(30, ...days.map((d) => data.minutes[d.key] ?? 0));
  const habits = HABITS.map((h) => ({ ...h, done: data.habitsDone.has(h.key) }));
  const moodLog = useMemo(() => {
    const out: Record<string, Mood> = {};
    for (const d of days) {
      const m = data.checkins[d.key]?.mood;
      if (m) out[d.key] = m;
    }
    return out;
  }, [days, data.checkins]);

  async function addPlan() {
    const t = pTime.trim();
    if (!pTitle.trim()) return setPErr('Add a title.');
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) return setPErr('Use a time like 19:30.');
    const [h, m] = t.split(':').map(Number);
    const err = await data.addPlan({ title: pTitle.trim(), time: pad(h) + ':' + pad(m), day: selDay.key, cat: pCat });
    if (err) return setPErr("Couldn't save. Try again.");
    setPTitle('');
    setPErr('');
    setSheet(null);
  }
  async function addTask() {
    const title = taskText.trim();
    if (!title) return;
    const err = await data.addTask(title);
    if (!err) setTaskText('');
  }
  function workoutMinutes(): number | null {
    const raw = mCustom.trim();
    const n = raw ? Number(raw) : mMin;
    return Number.isInteger(n) && n >= 1 && n <= 240 ? n : null;
  }
  function startWorkout() {
    const n = workoutMinutes();
    if (n == null) return setMErr('Enter whole minutes between 1 and 240.');
    setMErr('');
    setSheet(null);
    workout.start(mType, n);
    setSessionOpen(true);
  }
  async function logWorkout() {
    const n = workoutMinutes();
    if (n == null) return setMErr('Enter whole minutes between 1 and 240.');
    const err = await data.addMove(todayKey, mType, n);
    if (err) return setMErr("Couldn't save. Try again.");
    setMErr('');
    setMCustom('');
    setSheet(null);
  }
  function chooseMood(m: Mood) {
    data.saveCheckin(todayKey, m, energy, note);
  }
  function changeEnergy(e: string) {
    setEnergy(e);
    if (mood) data.saveCheckin(todayKey, mood, e, note);
  }
  function commitNote() {
    if (mood) data.saveCheckin(todayKey, mood, energy, note);
  }

  const noteDirty = !!mood && note !== (data.checkins[todayKey]?.note ?? '');
  const sheetInput = { height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: w.ink + '40', color: w.ink, fontFamily: font.regular, fontSize: 16 } as const;
  const pillBtn = (bg: string) => ({ minHeight: 48, paddingHorizontal: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: bg }) as const;
  const h2 = (color: string, size = 24) => ({ color, fontSize: size, lineHeight: size * 1.1, fontFamily: font.semibold, letterSpacing: -size * 0.02 }) as const;

  const header = (
    <View style={{ minHeight: 80, justifyContent: 'center' }}>
      <Text accessibilityRole="header" style={{ color: w.ink, fontSize: 32, lineHeight: 36, fontFamily: font.semibold, letterSpacing: -0.64 }}>{hello + (first ? ', ' + first : '') + '.'}</Text>
      <Text style={{ color: w.ink + '99', fontSize: 13, fontFamily: font.regular, marginTop: 4 }}>{dateLine + '  ·  Only you can see this page'}</Text>
    </View>
  );

  const strip = (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: wide ? 8 : 6, paddingTop: 6 }}>
      {days.map((d, i) => {
        const on = i === sel;
        const isToday = d.key === todayKey;
        const has = data.plans.some((p) => p.day === d.key);
        return (
          <Pressable key={d.key} accessibilityRole="tab" accessibilityLabel={d.name + ' ' + d.num + (isToday ? ', today' : '')} accessibilityState={{ selected: on }} onPress={() => setPicked(d.key)} style={{ flex: 1, minWidth: 0 }}>
            <View style={{ height: wide ? 76 : 68, borderRadius: 40, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? w.ink : 'transparent', borderWidth: on ? 0 : 1, borderColor: w.ink + '26', transform: [{ translateY: on ? -4 : 0 }] }}>
              <Text style={{ color: on ? w.paper : w.ink + '99', fontSize: 11, fontFamily: font.medium }}>{d.name}</Text>
              <Text style={{ color: on ? w.paper : w.ink, fontSize: 18, fontFamily: font.semibold }}>{d.num}</Text>
              <View style={{ height: 5, flexDirection: 'row', gap: 3 }}>
                {isToday && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: on ? w.coral : w.moss }} />}
                {has && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: w.sky }} />}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  const heroCard = (
    <Card tone="moss" glow pad={wide ? 28 : 22} style={{ minHeight: 180 }}>
      <Tag label={selDay.d.toLocaleDateString(undefined, { weekday: 'long' })} fg="#ffffff" bg="rgba(255,255,255,0.2)" />
      <Text style={{ color: '#ffffff', fontSize: 64, lineHeight: 66, fontFamily: font.semibold, letterSpacing: -2.2 }}>{dayPlans.length}</Text>
      <Text style={{ color: '#ffffff', fontSize: 20, fontFamily: font.semibold }}>{(dayPlans.length === 1 ? 'plan' : 'plans') + ', ' + openTasks.length + (openTasks.length === 1 ? ' task' : ' tasks')}</Text>
      {nextPlan ? (
        <View style={{ alignSelf: 'flex-start', marginTop: 10, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <Text style={{ color: '#ffffff', fontSize: 13, fontFamily: font.semibold }}>{fmt12(nextPlan.time)}</Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: '#ffffff', fontSize: 13, fontFamily: font.regular }}>{nextPlan.title}</Text>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Add a plan" onPress={() => { setPErr(''); setSheet('plan'); }} style={({ pressed }) => [pillBtn('#ffffff'), { alignSelf: 'flex-start', marginTop: 10, minHeight: 44, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <Icon name="plus" size={18} color={BLOCK_INK} />
          <Text style={{ color: BLOCK_INK, fontSize: 14, fontFamily: font.semibold }}>Add a plan</Text>
        </Pressable>
      )}
    </Card>
  );

  const checkinCard = (
    <Card tone="card" pad={wide ? 28 : 20}>
      <Tag label="Daily check in" fg={w.ink} bg={w.ink + '14'} />
      <Text style={[h2(w.ink, 26), { marginTop: 10 }]}>How are you today?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginTop: 20 }}>
        {MOODS.map(([value, label]) => <MoodTile key={value} mood={value} label={label} selected={mood === value} onPress={() => chooseMood(value)} />)}
      </View>
      <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.semibold, marginTop: 20, marginBottom: 8 }}>Energy</Text>
      <Segmented label="Energy" options={['low', 'steady', 'high']} value={energy} onChange={changeEnergy} />
      <View style={{ height: 52, marginTop: 14, paddingLeft: 18, paddingRight: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 26, backgroundColor: w.ink + '0d', borderWidth: 1, borderColor: w.ink + '14' }}>
        <TextInput accessibilityLabel="Add a note" placeholder="Add a note" placeholderTextColor={w.ink + '8c'} value={note} onChangeText={setNote} onBlur={commitNote} maxLength={60} style={{ flex: 1, minWidth: 0, color: w.ink, fontFamily: font.regular, fontSize: 15 }} />
        <Text style={{ color: w.ink + '8c', fontSize: 12, fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>{note.length + ' of 60'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Save note" disabled={!noteDirty} onPress={commitNote} hitSlop={8} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: noteDirty ? w.ink : w.ink + '14' }}>
          <Icon name="check" size={16} color={noteDirty ? w.paper : w.ink + '66'} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 20 }}>
        {days.map((d) => {
          const m = moodLog[d.key];
          return (
            <View key={d.key} accessibilityLabel={d.name + (m ? ', ' + m : ', no check in')} style={{ flex: 1, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: m ? moodFill(m, isDark) + '40' : w.ink + '0d' }}>
              {m ? <MoodFace mood={m} size={26} fill={moodFill(m, isDark)} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: w.ink + '33' }} />}
              <Text style={{ color: w.ink + '99', fontSize: 10, fontFamily: font.medium }}>{d.name.slice(0, 1)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );

  const plansBlock = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Tag label={selDay.d.toLocaleDateString(undefined, { weekday: 'long' })} fg={w.ink} bg={w.ink + '14'} />
          <Text accessibilityRole="header" style={[h2(w.ink, 32), { marginTop: 8 }]}>Plans</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add plan" onPress={() => { setPErr(''); setSheet('plan'); }} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: w.ink, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Icon name="plus" size={24} color={w.paper} />
        </Pressable>
      </View>
      <View style={{ marginTop: 16, gap: 12 }}>
        {dayPlans.length === 0 && (
          <View style={{ minHeight: 150, borderRadius: 28, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: w.ink + '40' }}>
            <CupsSpot />
            <Text style={{ color: w.ink, fontSize: 14, fontFamily: font.regular }}>Nothing planned. Add the first thing.</Text>
          </View>
        )}
        {dayPlans.map((p) => {
          const cat = CATS.find((c2) => c2.key === p.cat)!;
          const t = tone(cat.color);
          return (
            <Card key={p.id} tone={cat.color} pad={16} radius={24} style={{ minHeight: 76 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: t.tile }}>
                  <Text style={{ color: t.fg, fontSize: 13, fontFamily: font.semibold }}>{fmt12(p.time)}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text numberOfLines={2} style={{ color: t.fg, fontSize: 17, fontFamily: font.semibold }}>{p.title}</Text>
                  {p.cat !== 'other' && <Tag label={cat.label} fg={t.fg} bg={t.tile} />}
                </View>
                <IconButton icon="trash" label={'Delete ' + p.title} color={t.fg} onPress={() => data.deletePlan(p.id)} />
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );

  const tt = tone('lilac');
  const tasksCard = (
    <Card tone="lilac" glow pad={wide ? 28 : 22}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ gap: 8 }}>
          <Tag label="Private" fg={tt.fg} bg={tt.tile} />
          <Text style={h2(tt.fg, 32)}>Tasks</Text>
        </View>
        <Text style={{ maxWidth: 150, color: tt.fg, fontSize: 28, lineHeight: 30, fontFamily: font.semibold, letterSpacing: -0.6, textAlign: 'right' }}>{doneTasks.length + ' of ' + data.tasks.length + ' done'}</Text>
      </View>
      <View style={{ borderRadius: 22, padding: 12, marginTop: 16, backgroundColor: tt.tile }}>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: tt.line }}>
          <TextInput accessibilityLabel="Add a task" placeholder="Add a task" placeholderTextColor={tt.fg + '99'} value={taskText} onChangeText={setTaskText} onSubmitEditing={addTask} returnKeyType="done" style={{ flex: 1, minWidth: 0, color: tt.fg, fontFamily: font.regular, fontSize: 15 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={addTask} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tt.fg }}>
            <Icon name="plus" size={20} color="#ffffff" />
          </Pressable>
        </View>
        {openTasks.length === 0 && <Text style={{ color: tt.fg, opacity: 0.75, fontSize: 14, fontFamily: font.regular, paddingVertical: 18, textAlign: 'center' }}>Nothing here yet. Add a task above.</Text>}
        {openTasks.map((t) => (
          <View key={t.id} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: tt.line }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={'Complete ' + t.title} onPress={() => data.completeTask(t.id)} hitSlop={12} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: tt.fg }} />
            <Text style={{ flex: 1, color: tt.fg, fontSize: 15, fontFamily: font.semibold }}>{t.title}</Text>
            <IconButton icon="trash" label={'Delete ' + t.title} color={tt.fg} onPress={() => data.deleteTask(t.id)} />
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setShowDone((v) => !v)} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <Icon name="chevronDown" size={18} color={tt.fg} />
        <Text style={{ color: tt.fg, fontSize: 13, fontFamily: font.medium }}>{'Done, ' + doneTasks.length}</Text>
      </Pressable>
      {showDone && doneTasks.map((t) => (
        <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
          <Icon name="check" size={16} color={tt.fg} />
          <Text style={{ flex: 1, color: tt.fg, fontSize: 13, fontFamily: font.regular }}>{t.title}</Text>
          <IconButton icon="trash" label={'Delete ' + t.title} color={tt.fg} onPress={() => data.deleteTask(t.id)} />
        </View>
      ))}
    </Card>
  );

  const mt = tone('sky');
  const onMt = mt.fg === '#ffffff' ? w.sky : '#ffffff';
  const moveCard = (
    <Card tone="sky" glow pad={wide ? 28 : 22}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ gap: 8 }}>
          <Tag label="Workouts and habits" fg={mt.fg} bg={mt.tile} />
          <Text style={h2(mt.fg, 32)}>Workout</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => { if (workout.active) { setSessionOpen(true); return; } setMErr(''); setSheet('move'); }} style={({ pressed }) => [pillBtn(mt.fg), { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
          <Text style={{ color: onMt, fontSize: 14, fontFamily: font.semibold }}>{workout.active ? 'Open workout' : 'Start workout'}</Text>
        </Pressable>
      </View>
      {(workout.active || workout.done) && (
        <View style={{ marginTop: 18, padding: 14, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: mt.fg }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Open workout" onPress={() => setSessionOpen(true)} style={{ flex: 1 }}>
            <Text style={{ color: onMt, fontSize: 15, fontFamily: font.semibold }}>{workout.active ? workout.active.type + ', ' + clockOf(workout.left) : 'Workout finished'}</Text>
            <Text style={{ color: onMt, opacity: 0.8, fontSize: 12, fontFamily: font.regular }}>{workout.active ? (workout.running ? 'In progress. Tap to open.' : 'Paused. Tap to open.') : workout.done!.minutes + ' min of ' + workout.done!.type.toLowerCase() + ' logged'}</Text>
          </Pressable>
          {workout.active ? (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel={workout.running ? 'Pause workout' : 'Resume workout'} onPress={workout.running ? workout.pause : workout.resume} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: onMt }}>
                <Icon name={workout.running ? 'pause' : 'play'} size={20} color={mt.fg} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Stop workout" onPress={workout.stop} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: onMt }}>
                <Icon name="close" size={20} color={mt.fg} />
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={workout.dismissDone} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: onMt }}>
              <Icon name="close" size={20} color={mt.fg} />
            </Pressable>
          )}
        </View>
      )}
      <View accessibilityLabel="Workout minutes this week" style={{ height: 150, marginTop: 18, marginBottom: 14, padding: 12, borderRadius: 22, flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: mt.tile }}>
        {days.map((d) => (
          <View key={d.key} style={{ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={{ marginBottom: 20 }}>
              <View style={{ width: 12, height: 4 + ((data.minutes[d.key] ?? 0) / maxMin) * 90, borderRadius: 6, backgroundColor: mt.fg }} />
            </View>
            <Text style={{ position: 'absolute', bottom: 0, color: mt.fg, fontSize: 11, fontFamily: font.regular }}>{d.name.slice(0, 1)}</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: mt.fg, fontSize: 14, fontFamily: font.regular, marginBottom: 14 }}>{weekMinutes === 0 ? 'No workouts logged this week. Start one.' : 'You worked out ' + weekMinutes + (weekMinutes === 1 ? ' minute' : ' minutes') + ' this week.'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {habits.map((h) => (
          <Pressable key={h.key} accessibilityRole="checkbox" accessibilityState={{ checked: h.done }} onPress={() => data.toggleHabit(h.key, !h.done)} style={{ width: 138, minHeight: 88, padding: 12, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: mt.tile }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: h.done ? w.moss : 'transparent', borderColor: h.done ? w.moss : mt.fg }}>
              <Icon name={h.done ? 'check' : 'rings'} size={16} color={h.done ? '#ffffff' : mt.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ color: mt.fg, fontSize: 13, fontFamily: font.medium }}>{h.label}</Text>
              <Text style={{ color: mt.fg, opacity: 0.75, fontSize: 11, fontFamily: font.regular }}>{h.done ? 'Done today' : 'Not yet'}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Card>
  );

  const content: ReactNode[] = [header, strip, heroCard, checkinCard, plansBlock, tasksCard, moveCard];
  let i = 0;

  return (
    <View style={{ flex: 1, backgroundColor: w.paper }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: wide ? Math.max(20, width * 0.04) : 20, paddingTop: wide ? 32 : insets.top + 20, paddingBottom: (wide ? 40 : insets.bottom + 100) + kb }}
      >
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center', gap: 14 }}>
          {!!data.error && <Text accessibilityRole="alert" style={{ color: '#d90035', fontSize: 14, fontFamily: font.regular }}>{data.error}</Text>}
          {content.map((node) => (
            <Reveal key={i} index={i++}>{node}</Reveal>
          ))}
        </View>
      </ScrollView>
      <StatusBarCover color={w.paper} />

      {sheet === 'plan' && (
        <WeeeSheet title="Add plan" onClose={() => setSheet(null)}>
          <TextInput accessibilityLabel="Title" placeholder="Title" placeholderTextColor={w.ink + '8c'} value={pTitle} onChangeText={setPTitle} maxLength={80} style={sheetInput} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Text style={{ flex: 1, color: w.ink, fontSize: 14, fontFamily: font.regular }}>{selDay.d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            <TextInput accessibilityLabel="Time" placeholder="19:30" placeholderTextColor={w.ink + '8c'} value={pTime} onChangeText={setPTime} keyboardType="numbers-and-punctuation" maxLength={5} style={[sheetInput, { width: 110, textAlign: 'center' }]} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATS.map((ct) => <Chip key={ct.key} label={ct.label} active={pCat === ct.key} onPress={() => setPCat(ct.key)} />)}
          </View>
          {!!pErr && <Text style={{ color: '#d90035', fontSize: 14, fontFamily: font.regular }}>{pErr}</Text>}
          <Pressable accessibilityRole="button" onPress={addPlan} style={[pillBtn(w.ink), { minHeight: 52 }]}>
            <Text style={{ color: w.paper, fontSize: 16, fontFamily: font.semibold }}>Add plan</Text>
          </Pressable>
        </WeeeSheet>
      )}

      {sheet === 'move' && (
        <WeeeSheet title="Start a workout" placement="center" onClose={() => setSheet(null)}>
          <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.semibold }}>Workout</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {WORKOUTS.map((x) => <Chip key={x} label={x} active={mType === x} onPress={() => setMType(x)} />)}
          </View>
          <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.semibold }}>Minutes</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DURATIONS.map((x) => <Chip key={x} label={x + ' min'} active={!mCustom.trim() && mMin === x} onPress={() => { setMMin(x); setMCustom(''); }} />)}
          </View>
          <TextInput accessibilityLabel="Custom minutes" placeholder="Or enter your own minutes" placeholderTextColor={w.ink + '8c'} value={mCustom} onChangeText={(v) => setMCustom(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={3} style={sheetInput} />
          {!!mErr && <Text style={{ color: '#d90035', fontSize: 14, fontFamily: font.regular }}>{mErr}</Text>}
          <Pressable accessibilityRole="button" onPress={startWorkout} style={[pillBtn(w.ink), { minHeight: 52 }]}>
            <Text style={{ color: w.paper, fontSize: 16, fontFamily: font.semibold }}>Start workout</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={logWorkout} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: w.ink, fontSize: 14, fontFamily: font.semibold, textDecorationLine: 'underline' }}>Log without the timer</Text>
          </Pressable>
        </WeeeSheet>
      )}

      <MoveSession session={workout} visible={sessionOpen} onMinimize={() => setSessionOpen(false)} />
    </View>
  );
}
