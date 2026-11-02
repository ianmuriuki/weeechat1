import { Modal, Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../Primitives';
import { Icon } from '../../lib/icons';
import { onBlock, useWeee } from '../../theme/weee';
import { font } from '../../theme/type';
import type { WorkoutSession } from '../../hooks/useWorkoutSession';

const CUES: Record<string, string[]> = {
  Stretch: ['Stretch your neck, 30 seconds', 'Roll your shoulders, 30 seconds', 'Reach up and breathe, 30 seconds', 'Fold forward gently, 30 seconds'],
  Walk: ['Walk at an easy pace', 'Lengthen your steps', 'Breathe in time with your steps'],
  Run: ['Settle into a steady pace', 'Relax your shoulders', 'Keep your breathing even'],
  Cycling: ['Keep a steady cadence', 'Relax your grip', 'Breathe evenly'],
  Swimming: ['Long, smooth strokes', 'Breathe out under the water', 'Keep your kick light'],
  Strength: ['Slow and controlled, 30 seconds', 'Keep your core steady', 'Rest if you need to'],
  HIIT: ['Push hard for this round', 'Recover and breathe', 'Go again when you are ready'],
  Yoga: ['Breathe in, breathe out', 'Move slowly into the next pose', 'Hold it gently, 30 seconds'],
  Dance: ['Move to what feels good', 'Let your shoulders loosen', 'Keep it playful'],
  Football: ['Stay light on your feet', 'Keep your head up', 'Drink water when you pause'],
  Hike: ['Short, steady steps uphill', 'Look ahead, not down', 'Sip water often'],
  Other: ['Keep going at your own pace'],
};

const SIZE = 248;
const STROKE = 12;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const pad = (n: number) => String(n).padStart(2, '0');

function clock(sec: number) {
  const s = Math.max(0, sec);
  return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
}

// Full screen view of the running workout. Minimizing hides it and the workout keeps going.
export function MoveSession({ session, visible, onMinimize }: { session: WorkoutSession; visible: boolean; onMinimize: () => void }) {
  const { w, isDark } = useWeee();
  const fg = onBlock('sky', isDark);
  const insets = useSafeAreaInsets();
  const { active, done, left, elapsed, total, running } = session;
  if (!visible || (!active && !done)) return null;

  const type = active?.type ?? done?.type ?? '';
  const cues = CUES[type] ?? CUES.Other;
  const cue = cues[Math.floor(elapsed / 30000) % cues.length];
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;
  const endLabel = active?.endsAt != null ? 'Ends at ' + pad(new Date(active.endsAt).getHours()) + ':' + pad(new Date(active.endsAt).getMinutes()) : 'Paused';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onMinimize}>
      <View style={{ flex: 1, backgroundColor: w.sky, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon="chevronDown" label="Minimize workout" color={fg} onPress={onMinimize} />
          <Text style={{ color: fg, fontSize: 14, fontFamily: font.medium }}>Workout</Text>
        </View>
        <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}>
          {done && !active ? (
            <>
              <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: fg }}>
                <Icon name="check" size={44} color={w.sky} />
              </View>
              <Text style={{ color: fg, fontSize: 32, lineHeight: 36, fontFamily: font.semibold, letterSpacing: -0.6, marginTop: 24 }}>Workout finished</Text>
              <Text style={{ color: fg, fontSize: 16, fontFamily: font.regular, marginTop: 8 }}>{done.minutes + (done.minutes === 1 ? ' minute of ' : ' minutes of ') + done.type.toLowerCase()}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  session.dismissDone();
                  onMinimize();
                }}
                style={{ minHeight: 52, paddingHorizontal: 32, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 32, backgroundColor: fg }}
              >
                <Text style={{ color: w.sky, fontSize: 16, fontFamily: font.semibold }}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={{ color: fg, fontSize: 14, fontFamily: font.semibold, marginBottom: 16 }}>{type}</Text>
              <View style={{ width: SIZE, height: SIZE }}>
                <Svg width={SIZE} height={SIZE}>
                  <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={fg + '33'} strokeWidth={STROKE} fill="none" />
                  <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={fg} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} rotation={-90} origin={SIZE / 2 + ', ' + SIZE / 2} />
                </Svg>
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: fg, fontSize: 56, lineHeight: 62, fontFamily: font.semibold, letterSpacing: -1.1, fontVariant: ['tabular-nums'] }}>{clock(Math.ceil(left / 1000))}</Text>
                  <Text style={{ color: fg, opacity: 0.8, fontSize: 13, fontFamily: font.regular }}>{endLabel}</Text>
                </View>
              </View>
              <Text style={{ color: fg, fontSize: 24, lineHeight: 30, fontFamily: font.semibold, letterSpacing: -0.4, textAlign: 'center', marginTop: 28, maxWidth: 360, minHeight: 60 }}>{cue}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={running ? 'Pause workout' : 'Resume workout'}
                onPress={running ? session.pause : session.resume}
                style={{ width: 72, height: 72, borderRadius: 36, marginTop: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: fg }}
              >
                <Icon name={running ? 'pause' : 'play'} size={28} color={w.sky} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  session.stop();
                  onMinimize();
                }}
                style={{ minHeight: 48, justifyContent: 'center', marginTop: 12 }}
              >
                <Text style={{ color: fg, fontSize: 16, fontFamily: font.semibold, textDecorationLine: 'underline' }}>Stop workout</Text>
              </Pressable>
              <Text style={{ color: fg, opacity: 0.75, fontSize: 12, fontFamily: font.regular, marginTop: 4 }}>You can leave this screen. The workout keeps running.</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
