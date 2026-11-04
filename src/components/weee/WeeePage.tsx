import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../../lib/session';
import { useUnread } from '../../lib/unread';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../lib/icons';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { Avatar, IconButton } from '../Primitives';
import { StatusBarCover } from '../StatusBarCover';
import { Chip, WeeeSheet } from './WeeeSheet';
import { MoveSession } from './MoveSession';
import { MoodFace, type Mood } from './MoodFace';
import { CupsSpot, HeartArt, TwoFigures } from './Spots';
import { Card, Reveal, type Tone } from './Card';
import { BLOCK_INK, GLASS, moodFill, onBlock, personColors, useWeee, type Weee } from '../../theme/weee';
import { font } from '../../theme/type';
import { useWeeeData, type Cat, type Who } from '../../hooks/useWeeeData';
import { useWorkoutSession } from '../../hooks/useWorkoutSession';

const ND = Platform.OS !== 'web';
const QUESTIONS = [
  'What felt gentle today?', 'What do you want more time for?', 'What made you feel understood lately?',
  'What small thing should we plan together?', 'What helped you rest this week?', 'What would make tomorrow feel lighter?',
  'What have you wanted to tell me?', 'Where should we spend a slow afternoon?', 'What are you quietly proud of?',
  'What song feels like us right now?', 'What should we cook together next?', 'What moment would you keep from this month?',
];
const MOODS: [Mood, string][] = [['calm', 'Calm'], ['happy', 'Happy'], ['tired', 'Tired'], ['stressed', 'Stressed'], ['loving', 'Loving'], ['hug', 'Need a hug']];
const WORKOUTS = ['Walk', 'Run', 'Cycling', 'Swimming', 'Strength', 'HIIT', 'Yoga', 'Stretch', 'Dance', 'Football', 'Hike', 'Other'];
const DURATIONS = [5, 10, 15, 30, 45, 60];
const HABITS = [{ key: 'water', label: 'Water' }, { key: 'read', label: 'Read' }, { key: 'walk', label: 'Walk' }, { key: 'sleep', label: 'Sleep before 11' }];
const CATS: { key: Cat; color: Tone; label: string }[] = [
  { key: 'date', color: 'rose', label: 'Date' }, { key: 'errand', color: 'mint', label: 'Errand' },
  { key: 'workout', color: 'sky', label: 'Workout' }, { key: 'study', color: 'lilac', label: 'Study' }, { key: 'trip', color: 'sun', label: 'Trip' },
];


const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number);
  return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
}

const clockOf = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
};

function Tag({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center', backgroundColor: bg }}>
      <Text style={{ color: fg, fontSize: 11, fontFamily: font.semibold }}>{label}</Text>
    </View>
  );
}

function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  const { w } = useWeee();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const idx = Math.max(0, options.indexOf(value));
  const seg = width > 0 ? (width - 8) / options.length : 0;
  useEffect(() => {
    if (seg) Animated.spring(x, { toValue: idx * seg, useNativeDriver: ND, bounciness: 4 }).start();
  }, [idx, seg, x]);
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 44, borderRadius: 22, padding: 4, flexDirection: 'row', backgroundColor: w.ink + '14' }}>
      {seg > 0 && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 4, top: 4, width: seg, height: 36, borderRadius: 18, backgroundColor: w.ink, transform: [{ translateX: x }] }} />}
      {options.map((o) => (
        <Pressable key={o} accessibilityRole="radio" accessibilityState={{ checked: o === value }} onPress={() => onChange(o)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: o === value ? w.paper : w.ink, fontSize: 14, fontFamily: font.medium, textTransform: 'capitalize' }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function MoodTile({ mood, label, selected, onPress }: { mood: Mood; label: string; selected: boolean; onPress: () => void }) {
  const { w, isDark } = useWeee();
  const s = useRef(new Animated.Value(selected ? 1.1 : 1)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: selected ? 1.1 : 1, useNativeDriver: ND, bounciness: 8 }).start();
  }, [selected, s]);
  const fill = moodFill(mood, isDark);
  const lift: any = Platform.OS === 'web' ? { boxShadow: '0 8px 20px rgba(0,0,0,0.2)' } : { elevation: 4 };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={{ width: '31.8%' }}>
      <View style={[{ minHeight: 108, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: selected ? '#ffffff' : fill + '38' }, selected ? lift : null]}>
        <Animated.View style={{ transform: [{ scale: s }] }}>
          <MoodFace mood={mood} size={56} fill={fill} />
        </Animated.View>
        <Text style={{ color: selected ? BLOCK_INK : w.ink, fontSize: 12, fontFamily: selected ? font.semibold : font.regular }}>{label}</Text>
        {selected && (
          <View style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: w.moss }}>
            <Icon name="check" size={12} color="#ffffff" />
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function WeeePage() {
  const { w, isDark } = useWeee();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { width } = useWindowDimensions();
  const { session } = useSession();
  const { partner, partnerOnline } = useUnread();
  const wide = width > 820;
  const uid = session?.user.id ?? '';
  const partnerName = partner?.display_name?.trim() || 'Friend';
  const colors = personColors(uid, partner?.id, w);
  const tone = (name: keyof Weee) => {
    const fg = onBlock(name, isDark);
    return { fg, tile: fg === '#ffffff' ? 'rgba(255,255,255,0.18)' : GLASS, line: fg + '59' };
  };

  const [me, setMe] = useState<{ display_name: string; avatar_path: string | null } | null>(null);
  useEffect(() => {
    if (!uid) return;
    supabase.from('profiles').select('display_name, avatar_path').eq('id', uid).maybeSingle().then(({ data }) => setMe((data as any) ?? null));
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

  // A new day always starts on today. Tapping another day keeps it selected until the next midnight.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    setPicked(null);
  }, [todayKey]);
  const found = days.findIndex((d) => d.key === (picked ?? todayKey));
  const sel = found >= 0 ? found : Math.max(0, days.findIndex((d) => d.key === todayKey));
  const selDay = days[sel];

  const data = useWeeeData(uid, days[0].key, days[6].key, todayKey);
  const mood: Mood | null = data.checkins[todayKey]?.me?.mood ?? null;
  const partnerToday = data.checkins[todayKey]?.partner;
  const [energy, setEnergy] = useState('steady');
  const [note, setNote] = useState('');
  const moodLog = useMemo(() => {
    const out: Record<string, Mood> = {};
    for (const d of days) {
      const m = data.checkins[d.key]?.me?.mood;
      if (m) out[d.key] = m;
    }
    return out;
  }, [days, data.checkins]);
  const plans = data.plans;
  const tasks = data.tasks;
  const [tab, setTab] = useState<'mine' | 'yours' | 'ours'>('mine');
  const [taskText, setTaskText] = useState('');
  const [taskPrivate, setTaskPrivate] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const minutes = data.myMinutes;
  const partnerMinutes = data.partnerMinutes;
  const habits = HABITS.map((h) => ({ ...h, done: data.habitsDone.has(h.key) }));
  const startDate = data.togetherSince;
  const [answer, setAnswer] = useState('');
  const [sheet, setSheet] = useState<null | 'plan' | 'move' | 'date'>(null);
  const workout = useWorkoutSession((done, kind) => {
    data.addMove(todayKey, kind, done);
  });
  const [sessionOpen, setSessionOpen] = useState(false);

  // Energy and note start from what you saved today, once per day, so typing is never overwritten.
  const syncedFor = useRef('');
  useEffect(() => {
    if (!data.ready || syncedFor.current === todayKey) return;
    syncedFor.current = todayKey;
    const mine = data.checkins[todayKey]?.me;
    setEnergy(mine?.energy ?? 'steady');
    setNote(mine?.note ?? '');
  }, [data.ready, data.checkins, todayKey]);

  const [pTitle, setPTitle] = useState('');
  const [pTime, setPTime] = useState('19:30');
  const [pWho, setPWho] = useState<Who>('us');
  const [pCat, setPCat] = useState<Cat>('date');
  const [pErr, setPErr] = useState('');
  const [mType, setMType] = useState('Walk');
  const [mMin, setMMin] = useState(15);
  const [mCustom, setMCustom] = useState('');
  const [mErr, setMErr] = useState('');
  const [dText, setDText] = useState('');
  const [dErr, setDErr] = useState('');

  const burst = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  // A slow heartbeat on the Thinking of you card. It stays still when reduced motion is on.
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: ND }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: ND }),
      ]));
      loop.start();
    }, () => {});
    return () => loop?.stop();
  }, [pulse]);

  const hour = now.getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = me?.display_name?.trim();
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const status = partnerOnline
    ? partnerName + ' is online'
    : partner?.last_seen_at
      ? 'last seen at ' + pad(new Date(partner.last_seen_at).getHours()) + ':' + pad(new Date(partner.last_seen_at).getMinutes())
      : '';

  const dayPlans = plans.filter((p) => p.day === selDay.key).sort((a, b) => a.time.localeCompare(b.time));
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const shownTasks = openTasks.filter((t) => t.owner === tab);
  const nextPlan = dayPlans.find((p) => selDay.key !== todayKey || p.time >= pad(now.getHours()) + ':' + pad(now.getMinutes())) ?? dayPlans[0];
  const weekMinutes = days.reduce((s, d) => s + (minutes[d.key] ?? 0), 0);
  const maxMin = Math.max(30, ...days.map((d) => Math.max(minutes[d.key] ?? 0, partnerMinutes[d.key] ?? 0)));
  const daysTogether = startDate ? Math.max(0, Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - startDate.getTime()) / 86400000)) : null;
  const question = QUESTIONS[Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000) % QUESTIONS.length];
  const whoLabel = (who: Who) => (who === 'us' ? 'For us' : who === 'me' ? 'For me' : 'For ' + partnerName);

  async function addPlan() {
    const t = pTime.trim();
    if (!pTitle.trim()) return setPErr('Add a title.');
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) return setPErr('Use a time like 19:30.');
    const [h, m] = t.split(':').map(Number);
    const err = await data.addPlan({ title: pTitle.trim(), time: pad(h) + ':' + pad(m), day: selDay.key, who: pWho, cat: pCat });
    if (err) return setPErr("Couldn't save. Try again.");
    setPTitle('');
    setPErr('');
    setSheet(null);
  }
  async function addTask() {
    const title = taskText.trim();
    if (!title) return;
    const err = await data.addTask({ title, owner: tab, priv: taskPrivate && tab === 'mine' });
    if (!err) setTaskText('');
  }
  async function sendNudge() {
    const err = await data.sendNudge();
    if (err) return;
    burst.setValue(0);
    Animated.timing(burst, { toValue: 1, duration: 800, useNativeDriver: ND }).start();
  }
  async function saveDate() {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dText.trim());
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
    if (!d || isNaN(d.getTime()) || d.getMonth() !== +m![2] - 1) return setDErr('Use the form 2025-02-12.');
    if (d.getTime() > Date.now()) return setDErr('Pick a date that has already passed.');
    const err = await data.saveTogether(keyOf(d));
    if (err) return setDErr("Couldn't save. Try again.");
    setDErr('');
    setSheet(null);
  }
  async function saveAnswer() {
    const body = answer.trim();
    if (!body) return;
    const err = await data.saveAnswer(todayKey, question, body);
    if (!err) setAnswer('');
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

  const noteDirty = !!mood && note !== (data.checkins[todayKey]?.me?.note ?? '');
  const sheetInput = { height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: w.ink + '40', color: w.ink, fontFamily: font.regular, fontSize: 16 } as const;
  const pillBtn = (bg: string) => ({ minHeight: 48, paddingHorizontal: 20, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: bg }) as const;
  const h2 = (color: string, size = 24) => ({ color, fontSize: size, lineHeight: size * 1.1, fontFamily: font.semibold, letterSpacing: -size * 0.02 }) as const;

  // ---------- header
  const header = (
    <View style={{ minHeight: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" style={{ color: w.ink, fontSize: 32, lineHeight: 36, fontFamily: font.semibold, letterSpacing: -0.64 }}>{hello + (first ? ', ' + first : '') + '.'}</Text>
        <Text style={{ color: w.ink + '99', fontSize: 13, fontFamily: font.regular, marginTop: 4 }}>{dateLine + (status ? '  \u00B7  ' + status : '')}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ borderWidth: 3, borderColor: w.paper, borderRadius: 30 }}>
          <Avatar name={partner?.display_name || '?'} diameter={wide ? 52 : 44} color={colors.partner} path={partner?.avatar_path} />
        </View>
        <View style={{ marginLeft: -12, borderWidth: 3, borderColor: w.paper, borderRadius: 30 }}>
          <Avatar name={me?.display_name || '?'} diameter={wide ? 52 : 44} color={colors.me} path={me?.avatar_path} />
        </View>
      </View>
    </View>
  );

  // ---------- week strip
  const strip = (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: wide ? 8 : 6, paddingTop: 6 }}>
      {days.map((d, i) => {
        const on = i === sel;
        const isToday = d.key === todayKey;
        const dots = plans.filter((p) => p.day === d.key);
        const dot = dots.length ? (dots.every((p) => p.who === 'us') ? w.moss : dots[0].who === 'me' ? colors.me : colors.partner) : null;
        return (
          <Pressable key={d.key} accessibilityRole="tab" accessibilityLabel={d.name + ' ' + d.num + (isToday ? ', today' : '')} accessibilityState={{ selected: on }} onPress={() => setPicked(d.key)} style={{ flex: 1, minWidth: 0 }}>
            <View style={{ height: wide ? 76 : 68, borderRadius: 40, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? w.ink : 'transparent', borderWidth: on ? 0 : 1, borderColor: w.ink + '26', transform: [{ translateY: on ? -4 : 0 }] }}>
              <Text style={{ color: on ? w.paper : w.ink + '99', fontSize: 11, fontFamily: font.medium }}>{d.name}</Text>
              <Text style={{ color: on ? w.paper : w.ink, fontSize: 18, fontFamily: font.semibold }}>{d.num}</Text>
              <View style={{ height: 5, flexDirection: 'row', gap: 3 }}>
                {isToday && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: on ? w.coral : w.moss }} />}
                {dot && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dot }} />}
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  // ---------- hero
  const heroCard = (
    <Card tone="moss" glow pad={wide ? 28 : 22} style={{ minHeight: 212 }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 4, zIndex: 1 }}>
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
        </View>
        <View pointerEvents="none" style={{ width: wide ? 260 : 156, marginRight: -6, marginBottom: -6, justifyContent: 'flex-end' }}>
          <TwoFigures />
        </View>
      </View>
    </Card>
  );

  // ---------- daily check in
  const checkinCard = (
    <Card tone="card" pad={wide ? 28 : 20} style={{ minHeight: wide ? 520 : undefined }}>
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
      <View style={{ marginTop: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={me?.display_name || '?'} diameter={40} color={colors.me} path={me?.avatar_path} />
          <Text style={{ flex: 1, color: w.ink, fontSize: 14, fontFamily: font.medium }}>{mood ? 'You, ' + MOODS.find((m) => m[0] === mood)![1].toLowerCase() : 'Not checked in yet'}</Text>
          {mood && <MoodFace mood={mood} size={32} fill={moodFill(mood, isDark)} />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderStyle: partnerToday ? 'solid' : 'dashed', borderColor: partnerToday ? moodFill(partnerToday.mood, isDark) : w.ink + '66', alignItems: 'center', justifyContent: 'center' }}>
            <Avatar name={partner?.display_name || '?'} diameter={30} color={colors.partner} path={partner?.avatar_path} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: w.ink + 'b3', fontSize: 14, fontFamily: font.regular }}>{partnerToday ? partnerName + ', ' + MOODS.find((m) => m[0] === partnerToday.mood)![1].toLowerCase() : 'Waiting for ' + partnerName}</Text>
            {!!partnerToday && <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.regular, marginTop: 2 }}>{'Energy ' + partnerToday.energy + (partnerToday.note ? '. ' + partnerToday.note : '')}</Text>}
          </View>
          {partnerToday && <MoodFace mood={partnerToday.mood} size={32} fill={moodFill(partnerToday.mood, isDark)} />}
        </View>
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

  // ---------- days together and thinking of you
  const daysCard = (
    <Card tone="deep" glow pad={wide ? 24 : 18} onPress={() => { setDText(startDate ? keyOf(startDate) : ''); setDErr(''); setSheet('date'); }} label="Set the date you became friends" style={{ minHeight: 244 }}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: w.coral }}>
          <Icon name="heart" size={18} color={BLOCK_INK} />
        </View>
        {daysTogether != null ? (
          <View>
            <Text style={{ color: w.onDeep, fontSize: wide ? 64 : 52, lineHeight: wide ? 64 : 52, fontFamily: font.semibold, letterSpacing: -2 }}>{daysTogether}</Text>
            <Text style={{ color: w.onDeep, fontSize: 16, fontFamily: font.semibold, marginTop: 4 }}>days as friends</Text>
            <Text style={{ color: w.onDeep + 'b8', fontSize: 12, fontFamily: font.regular, marginTop: 6 }}>{'Since ' + startDate!.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </View>
        ) : (
          <View>
            <Text style={{ color: w.onDeep, fontSize: 24, lineHeight: 28, fontFamily: font.semibold, letterSpacing: -0.4 }}>Friends for</Text>
            <Text style={{ color: w.onDeep + 'b8', fontSize: 13, fontFamily: font.regular, marginTop: 6 }}>Count the days since you became friends.</Text>
            <View style={{ alignSelf: 'flex-start', marginTop: 12, height: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <Icon name="plus" size={16} color={w.onDeep} />
              <Text style={{ color: w.onDeep, fontSize: 13, fontFamily: font.semibold }}>Add the date</Text>
            </View>
          </View>
        )}
      </View>
    </Card>
  );

  const nudgeLeft = data.nudgeUntil ? data.nudgeUntil - now.getTime() : 0;
  const sent = nudgeLeft > 0;
  const hearts = [-40, -20, 0, 20, 40];
  const nudgeCard = (
    <Card tone="coral" glow pad={wide ? 22 : 16} style={{ minHeight: 244 }}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <Text style={{ color: BLOCK_INK, fontSize: 12, fontFamily: font.semibold }}>{'For ' + partnerName}</Text>
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
          <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
            <HeartArt size={wide ? 104 : 84} />
          </Animated.View>
          {sent && hearts.map((dx, i) => (
            <Animated.View key={dx} pointerEvents="none" style={{ position: 'absolute', opacity: burst.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }), transform: [{ translateX: dx }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, -(52 + (i % 2) * 22)] }) }] }}>
              <HeartArt size={16} fill />
            </Animated.View>
          ))}
        </View>
        <Text style={{ color: BLOCK_INK, fontSize: 16, fontFamily: font.semibold, marginBottom: 10 }}>Send a nudge</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: sent }} disabled={sent} onPress={sendNudge} style={({ pressed }) => ({ height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: sent ? 'rgba(20,24,27,0.2)' : BLOCK_INK, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
          <Icon name={sent ? 'check' : 'heart'} size={18} color={sent ? BLOCK_INK : '#ffffff'} />
          <Text style={{ color: sent ? BLOCK_INK : '#ffffff', fontSize: 14, fontFamily: font.semibold }}>{sent ? 'Sent' : 'Send'}</Text>
        </Pressable>
        <Text style={{ color: BLOCK_INK, fontSize: 11, fontFamily: font.regular, textAlign: 'center', marginTop: 8, minHeight: 14 }}>{sent ? 'Try again in ' + Math.max(1, Math.ceil(nudgeLeft / 60000)) + ' min' : ''}</Text>
      </View>
    </Card>
  );

  // ---------- plans
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
            <Card key={p.id} tone={cat.color} pad={16} radius={24} style={{ minHeight: 88 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ height: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center', backgroundColor: t.tile }}>
                  <Text style={{ color: t.fg, fontSize: 13, fontFamily: font.semibold }}>{fmt12(p.time)}</Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text numberOfLines={2} style={{ color: t.fg, fontSize: 17, fontFamily: font.semibold }}>{p.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Tag label={whoLabel(p.who)} fg={t.fg} bg={t.tile} />
                    <Tag label={cat.label} fg={t.fg} bg={t.tile} />
                  </View>
                </View>
                {p.who === 'us' && (
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: t.fg, backgroundColor: colors.partner }} />
                    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: t.fg, backgroundColor: colors.me, marginLeft: -9 }} />
                  </View>
                )}
                <IconButton icon="trash" label={'Delete ' + p.title} color={t.fg} onPress={() => data.deletePlan(p.id)} />
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );

  // ---------- tasks
  const tt = tone('lilac');
  const tasksCard = (
    <Card tone="lilac" glow pad={wide ? 28 : 22}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ gap: 8 }}>
          <Tag label="Shared and private" fg={tt.fg} bg={tt.tile} />
          <Text style={h2(tt.fg, 32)}>Tasks</Text>
        </View>
        <Text style={{ maxWidth: 150, color: tt.fg, fontSize: 28, lineHeight: 30, fontFamily: font.semibold, letterSpacing: -0.6, textAlign: 'right' }}>{doneTasks.length + ' of ' + tasks.length + ' done'}</Text>
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6, marginTop: 18, marginBottom: 12 }}>
        {([['mine', 'Mine'], ['yours', 'Yours'], ['ours', 'Ours']] as const).map(([k, label]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={{ minHeight: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', backgroundColor: tab === k ? tt.fg : tt.tile }}>
            <Text style={{ color: tab === k ? '#ffffff' : tt.fg, fontSize: 13, fontFamily: font.medium }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ borderRadius: 22, padding: 12, backgroundColor: tt.tile }}>
        <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: tt.line }}>
          <TextInput accessibilityLabel="Add a task" placeholder="Add a task" placeholderTextColor={tt.fg + '99'} value={taskText} onChangeText={setTaskText} onSubmitEditing={addTask} returnKeyType="done" style={{ flex: 1, minWidth: 0, color: tt.fg, fontFamily: font.regular, fontSize: 15 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={addTask} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tt.fg }}>
            <Icon name="plus" size={20} color="#ffffff" />
          </Pressable>
        </View>
        {tab === 'mine' && (
          <View style={{ paddingTop: 10, flexDirection: 'row' }}>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: taskPrivate }} onPress={() => setTaskPrivate((v) => !v)} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: taskPrivate ? tt.fg : 'rgba(255,255,255,0.4)' }}>
              <Icon name="lock" size={16} color={taskPrivate ? '#ffffff' : tt.fg} />
              <Text style={{ color: taskPrivate ? '#ffffff' : tt.fg, fontSize: 13, fontFamily: font.medium }}>Private</Text>
            </Pressable>
          </View>
        )}
        {shownTasks.length === 0 && <Text style={{ color: tt.fg, opacity: 0.75, fontSize: 14, fontFamily: font.regular, paddingVertical: 18, textAlign: 'center' }}>Nothing here yet. Add a task above.</Text>}
        {shownTasks.map((t) => (
          <View key={t.id} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: tt.line }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={'Complete ' + t.title} onPress={() => data.completeTask(t.id)} hitSlop={12} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: tt.fg }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: tt.fg, fontSize: 15, fontFamily: font.semibold }}>{t.title}</Text>
              <Text style={{ color: tt.fg, opacity: 0.7, fontSize: 12, fontFamily: font.regular }}>{t.owner === 'ours' ? 'For both of you' : t.owner === 'yours' ? 'For ' + partnerName : t.priv ? 'Only you can see this' : 'For you'}</Text>
            </View>
            {t.priv && <Icon name="lock" size={18} color={tt.fg} />}
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
          <Text style={{ flex: 1, color: tt.fg, fontSize: 13, fontFamily: font.regular }}>{t.title + (t.doneByMe ? '. Finished by you' : '. Finished by ' + partnerName)}</Text>
        </View>
      ))}
    </Card>
  );

  // ---------- move
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
          <Text style={{ color: mt.fg === '#ffffff' ? w.sky : '#ffffff', fontSize: 14, fontFamily: font.semibold }}>{workout.active ? 'Open workout' : 'Start workout'}</Text>
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
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 20 }}>
              <View style={{ width: 8, height: 4 + ((minutes[d.key] ?? 0) / maxMin) * 90, borderRadius: 4, backgroundColor: colors.me }} />
              <View style={{ width: 8, height: 4 + ((partnerMinutes[d.key] ?? 0) / maxMin) * 90, borderRadius: 4, backgroundColor: colors.partner, opacity: 0.6 }} />
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
              <Text style={{ color: mt.fg, opacity: 0.75, fontSize: 11, fontFamily: font.regular }}>{h.done ? '1 day' : '0 days'}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </Card>
  );

  // ---------- question and week
  const questionCard = (
    <Card tone="card" pad={wide ? 28 : 22}>
      <Tag label="Question of the day" fg={BLOCK_INK} bg={w.rose} />
      <Text style={[h2(w.ink, 28), { marginTop: 12 }]}>{question}</Text>
      {!data.answers.mine ? (
        <>
          <TextInput accessibilityLabel="Your answer" multiline placeholder="Your answer stays private until both reply" placeholderTextColor={w.ink + '8c'} value={answer} onChangeText={setAnswer} style={{ minHeight: 100, marginTop: 18, marginBottom: 12, padding: 16, borderRadius: 22, backgroundColor: w.ink + '0d', borderWidth: 1, borderColor: w.ink + '14', color: w.ink, fontFamily: font.regular, fontSize: 15, textAlignVertical: 'top' }} />
          <Pressable accessibilityRole="button" onPress={saveAnswer} style={[pillBtn(w.rose), { alignSelf: 'flex-start', opacity: answer.trim() ? 1 : 0.5 }]}>
            <Text style={{ color: BLOCK_INK, fontSize: 14, fontFamily: font.semibold }}>Save answer</Text>
          </Pressable>
        </>
      ) : (
        data.answers.partner ? (
          <View style={{ marginTop: 18, gap: 10 }}>
            <View style={{ padding: 16, borderRadius: 22, gap: 4, backgroundColor: w.ink + '0d' }}>
              <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.semibold }}>You</Text>
              <Text style={{ color: w.ink, fontSize: 15, fontFamily: font.regular }}>{data.answers.mine?.body}</Text>
            </View>
            <View style={{ padding: 16, borderRadius: 22, gap: 4, backgroundColor: w.rose + '40' }}>
              <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.semibold }}>{partnerName}</Text>
              <Text style={{ color: w.ink, fontSize: 15, fontFamily: font.regular }}>{data.answers.partner.body}</Text>
            </View>
          </View>
        ) : (
          <View style={{ minHeight: 100, marginTop: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: w.rose + '40' }}>
            <Icon name="lock" color={w.ink} />
            <Text style={{ color: w.ink, fontSize: 14, fontFamily: font.semibold }}>Your answer is saved</Text>
            <Text style={{ color: w.ink, fontSize: 12, fontFamily: font.regular }}>{'Waiting for ' + partnerName}</Text>
          </View>
        )
      )}
    </Card>
  );

  const weekCard = (
    <Card tone="deep" glow pad={wide ? 32 : 24}>
      <Tag label="Our week" fg={w.onDeep} bg="rgba(255,255,255,0.14)" />
      <Text style={[h2(w.onDeep, 28), { marginTop: 10 }]}>Quiet progress, together.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 22, rowGap: 16 }}>
        {[[plans.length, 'plans'], [doneTasks.length, 'tasks'], [weekMinutes, 'minutes'], [Object.keys(moodLog).length, 'check ins']].map(([n, label]) => (
          <View key={String(label)} style={{ width: wide ? '25%' : '50%' }}>
            <Text style={{ color: w.onDeep, fontSize: 44, lineHeight: 48, fontFamily: font.semibold, letterSpacing: -1.2, fontVariant: ['tabular-nums'] }}>{String(n)}</Text>
            <Text style={{ color: w.onDeep, opacity: 0.8, fontSize: 12, fontFamily: font.regular }}>{String(label)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );

  // ---------- layout
  const row = (children: ReactNode) => <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>{children}</View>;
  let i = 0;
  const content: ReactNode[] = wide
    ? [
        header, strip,
        row(<><View style={{ flex: 1.7 }}>{heroCard}</View><View style={{ flex: 1 }}>{daysCard}</View></>),
        row(<><View style={{ flex: 1.7 }}>{checkinCard}</View><View style={{ flex: 1 }}>{nudgeCard}</View></>),
        row(<><View style={{ flex: 1 }}>{plansBlock}</View><View style={{ flex: 1 }}>{tasksCard}</View></>),
        row(<><View style={{ flex: 1.7 }}>{moveCard}</View><View style={{ flex: 1 }}>{questionCard}</View></>),
        weekCard,
      ]
    : [
        header, strip, heroCard, checkinCard,
        row(<><View style={{ flex: 1 }}>{daysCard}</View><View style={{ flex: 1 }}>{nudgeCard}</View></>),
        plansBlock, tasksCard, moveCard, questionCard, weekCard,
      ];

  return (
    <View style={{ flex: 1, backgroundColor: w.paper }}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingHorizontal: wide ? Math.max(20, width * 0.04) : 20, paddingTop: wide ? 32 : insets.top + 20, paddingBottom: (wide ? 40 : insets.bottom + 100) + kb }}
      >
        <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 14 }}>
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['us', 'me', 'you'] as Who[]).map((x) => <Chip key={x} label={x === 'us' ? 'Us' : x === 'me' ? 'Me' : partner?.display_name?.trim() || 'You'} active={pWho === x} onPress={() => setPWho(x)} />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {CATS.map((ct) => (
              <Pressable key={ct.key} accessibilityRole="button" accessibilityLabel={ct.label + ' category'} accessibilityState={{ selected: pCat === ct.key }} onPress={() => setPCat(ct.key)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: w[ct.color], borderWidth: pCat === ct.key ? 3 : 0, borderColor: w.ink }} />
            ))}
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

      {sheet === 'date' && (
        <WeeeSheet title="Friends for" onClose={() => setSheet(null)}>
          <Text style={{ color: w.ink, fontSize: 14, fontFamily: font.regular }}>The day your friendship started, written as year, month, day.</Text>
          <TextInput accessibilityLabel="Start date" placeholder="2025-02-12" placeholderTextColor={w.ink + '8c'} value={dText} onChangeText={setDText} keyboardType="numbers-and-punctuation" maxLength={10} style={sheetInput} />
          {!!dErr && <Text style={{ color: '#d90035', fontSize: 14, fontFamily: font.regular }}>{dErr}</Text>}
          <Pressable accessibilityRole="button" onPress={saveDate} style={[pillBtn(w.ink), { minHeight: 52 }]}>
            <Text style={{ color: w.paper, fontSize: 16, fontFamily: font.semibold }}>Save date</Text>
          </Pressable>
        </WeeeSheet>
      )}

      <MoveSession session={workout} visible={sessionOpen} onMinimize={() => setSessionOpen(false)} />
    </View>
  );
}
