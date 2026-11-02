import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';
import { IconButton } from './Primitives';
import { MAX_BYTES, readBytes, type Picked } from '../lib/media';
import { space, radius, fontSize, control } from '../theme/tokens';
import { font } from '../theme/type';

const CANCEL_DX = -90;
const LOCK_DY = -80;
const MIN_MS = 700;
const LIVE_BARS = 52;

type Phase = 'idle' | 'holding' | 'locked' | 'paused' | 'review';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function downsample(peaks: number[], n: number): number[] | undefined {
  if (peaks.length < 4) return undefined;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.floor((i * peaks.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * peaks.length) / n));
    let m = 0;
    for (let k = a; k < b && k < peaks.length; k++) m = Math.max(m, peaks[k]);
    return Math.round(m * 100);
  });
}

function Bars({ values, color, dim, progress }: { values: number[]; color: string; dim: string; progress?: number }) {
  return (
    <>
      {values.map((v, i) => {
        const on = progress == null || i / values.length < progress;
        return <View key={i} style={{ width: 3, height: 4 + Math.min(1, Math.max(0, v)) * 40, borderRadius: 2, backgroundColor: on ? color : dim, opacity: on ? 1 : 0.5 }} />;
      })}
    </>
  );
}

export function VoiceRecorder({ onRecorded, onHint }: { onRecorded: (p: Picked) => void; onHint: (t: string) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });

  const [phase, setPhaseState] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [willCancel, setWillCancel] = useState(false);
  const [reviewUri, setReviewUri] = useState<string | null>(null);
  const [reviewBars, setReviewBars] = useState<number[]>([]);
  const phaseRef = useRef<Phase>('idle');
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const blink = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;

  const accum = useRef(0);
  const segStart = useRef(0);
  const segRunning = useRef(false);
  const peaks = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const recording = useRef(false);
  const busy = useRef(false);
  const pendingStop = useRef<null | 'send' | 'discard'>(null);

  const player = useAudioPlayer(reviewUri ? { uri: reviewUri } : null);
  const pst = useAudioPlayerStatus(player);
  useEffect(() => {
    if (pst.didJustFinish) player.seekTo(0);
  }, [pst.didJustFinish, player]);

  function setPhase(p: Phase) {
    phaseRef.current = p;
    setPhaseState(p);
  }

  function total() {
    return accum.current + (segRunning.current ? Date.now() - segStart.current : 0);
  }

  function tick() {
    setElapsed(total());
    let lvl: number | null = null;
    try {
      const st: any = (recorder as any).getStatus?.();
      if (st && typeof st.metering === 'number') lvl = Math.min(1, Math.max(0, (st.metering + 60) / 60));
    } catch {
      // Metering is optional.
    }
    if (lvl != null) peaks.current.push(lvl);
    const shown = lvl ?? 0.12 + Math.random() * 0.25;
    setLevels((prev) => {
      const next = prev.concat(shown);
      return next.length > LIVE_BARS ? next.slice(next.length - LIVE_BARS) : next;
    });
  }

  async function begin() {
    if (busy.current) return;
    busy.current = true;
    pendingStop.current = null;
    try {
      const had = await AudioModule.getRecordingPermissionsAsync();
      if (!had.granted) {
        const got = await AudioModule.requestRecordingPermissionsAsync();
        busy.current = false;
        onHint(got.granted ? 'Microphone is on. Hold the mic to record.' : 'Microphone access is off. Turn it on in settings.');
        return;
      }
      setPhase('holding');
      setElapsed(0);
      setLevels([]);
      setWillCancel(false);
      peaks.current = [];
      accum.current = 0;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recording.current = true;
      segStart.current = Date.now();
      segRunning.current = true;
      timer.current = setInterval(tick, 100);
    } catch {
      busy.current = false;
      recording.current = false;
      setPhase('idle');
      onHint("Couldn't start recording.");
      return;
    }
    if (pendingStop.current) await finish(pendingStop.current === 'send');
  }

  async function stopRecorder() {
    clearInterval(timer.current);
    if (segRunning.current) {
      accum.current += Date.now() - segStart.current;
      segRunning.current = false;
    }
    recording.current = false;
    try {
      await recorder.stop();
    } catch {
      // Already stopped.
    }
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    return recorder.uri;
  }

  async function deliver(uri: string, ms: number) {
    if (ms < MIN_MS) {
      onHint('Hold to record, release to send.');
      return;
    }
    try {
      let bytes: Uint8Array;
      let mime = 'audio/mp4';
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        mime = blob.type || 'audio/webm';
        bytes = new Uint8Array(await blob.arrayBuffer());
      } else {
        bytes = await readBytes(uri);
        const e = (uri.split('.').pop() ?? '').toLowerCase();
        mime = e === 'webm' ? 'audio/webm' : e === '3gp' ? 'audio/3gpp' : e === 'caf' ? 'audio/x-caf' : 'audio/mp4';
      }
      if (bytes.byteLength > MAX_BYTES) throw new Error('too big');
      const ext = mime.includes('webm') ? 'webm' : mime.includes('3gpp') ? '3gp' : mime.includes('caf') ? 'caf' : 'm4a';
      onRecorded({
        uri,
        name: 'voice-note.' + ext,
        mime,
        size: bytes.byteLength,
        width: null,
        height: null,
        kind: 'audio',
        data: bytes,
        durationMs: ms,
        waveform: downsample(peaks.current, 40),
      });
    } catch {
      onHint("Couldn't save that recording.");
    }
  }

  async function finish(send: boolean) {
    const uri = await stopRecorder();
    const ms = accum.current;
    setPhase('idle');
    drag.setValue({ x: 0, y: 0 });
    busy.current = false;
    if (send && uri) await deliver(uri, ms);
  }

  function requestFinish(send: boolean) {
    if (recording.current) finish(send);
    else if (busy.current) pendingStop.current = send ? 'send' : 'discard';
  }

  function lockIt() {
    if (phaseRef.current !== 'holding') return;
    setPhase('locked');
    drag.setValue({ x: 0, y: 0 });
  }

  function pauseRec() {
    try {
      recorder.pause();
    } catch {
      onHint("Couldn't pause.");
      return;
    }
    clearInterval(timer.current);
    accum.current += Date.now() - segStart.current;
    segRunning.current = false;
    setElapsed(accum.current);
    setPhase('paused');
  }

  function resumeRec() {
    try {
      recorder.record();
    } catch {
      onHint("Couldn't resume.");
      return;
    }
    segStart.current = Date.now();
    segRunning.current = true;
    timer.current = setInterval(tick, 100);
    setPhase('locked');
  }

  async function listen() {
    const uri = await stopRecorder();
    if (!uri) {
      busy.current = false;
      setPhase('idle');
      onHint("Couldn't play that back.");
      return;
    }
    setElapsed(accum.current);
    setReviewBars((downsample(peaks.current, 44) ?? Array.from({ length: 44 }, () => 30)).map((v) => v / 100));
    setReviewUri(uri);
    setPhase('review');
  }

  function leaveReview() {
    try {
      player.pause();
    } catch {
      // Nothing was playing.
    }
    setReviewUri(null);
    busy.current = false;
    setPhase('idle');
  }

  function toggleReview() {
    if (pst.playing) player.pause();
    else player.play();
  }

  async function sendReview() {
    const uri = reviewUri;
    const ms = accum.current;
    leaveReview();
    if (uri) await deliver(uri, ms);
  }

  const fn = useRef({ begin, requestFinish, lockIt });
  fn.current = { begin, requestFinish, lockIt };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => phaseRef.current === 'idle',
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          fn.current.begin();
        },
        onPanResponderMove: (_e, g) => {
          if (phaseRef.current !== 'holding') return;
          drag.setValue({ x: Math.min(0, g.dx), y: Math.min(0, g.dy) });
          setWillCancel(g.dx < CANCEL_DX);
          if (g.dy < LOCK_DY) fn.current.lockIt();
        },
        onPanResponderRelease: (_e, g) => {
          if (phaseRef.current !== 'holding') return;
          fn.current.requestFinish(g.dx >= CANCEL_DX);
        },
        onPanResponderTerminate: () => {
          if (phaseRef.current === 'holding') fn.current.requestFinish(false);
        },
      }),
    [drag],
  );

  useEffect(() => {
    if (phase !== 'holding' && phase !== 'locked') return;
    const nd = Platform.OS !== 'web';
    const b = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0.2, duration: 600, useNativeDriver: nd }),
      Animated.timing(blink, { toValue: 1, duration: 600, useNativeDriver: nd }),
    ]));
    const h = Animated.loop(Animated.timing(halo, { toValue: 1, duration: 1100, useNativeDriver: nd }));
    halo.setValue(0);
    b.start();
    h.start();
    return () => {
      b.stop();
      h.stop();
    };
  }, [phase, blink, halo]);

  useEffect(
    () => () => {
      clearInterval(timer.current);
      if (recording.current) recorder.stop().catch(() => {});
    },
    [recorder],
  );

  const cancelOpacity = drag.x.interpolate({ inputRange: [-140, -40, 0], outputRange: [0, 0.7, 1], extrapolate: 'clamp' });
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });
  const inPanel = phase === 'locked' || phase === 'paused' || phase === 'review';
  const reviewRatio = pst.duration > 0 ? Math.min(1, pst.currentTime / pst.duration) : 0;

  return (
    <>
      {phase === 'holding' && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: space[2], paddingRight: control.md + space[4], backgroundColor: c.surfaceSubtle }}>
          <Animated.View style={{ width: 10, height: 10, borderRadius: 5, marginLeft: space[3], marginRight: space[2], backgroundColor: c.danger, opacity: blink }} />
          <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.medium, fontVariant: ['tabular-nums'] }}>{fmt(elapsed)}</Text>
          <Animated.View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: cancelOpacity, transform: [{ translateX: drag.x.interpolate({ inputRange: [-200, 0], outputRange: [-60, 0], extrapolate: 'clamp' }) }] }}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chevron" size={18} color={willCancel ? c.danger : c.textSecondary} />
            </View>
            <Text style={{ color: willCancel ? c.danger : c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{willCancel ? 'Release to cancel' : 'Slide to cancel'}</Text>
          </Animated.View>
        </View>
      )}

      {phase === 'holding' && (
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', right: space[2] + 6, bottom: 78, zIndex: 3, width: 36, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'space-around', paddingVertical: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.divider, transform: [{ translateY: drag.y.interpolate({ inputRange: [-120, 0], outputRange: [-24, 0], extrapolate: 'clamp' }) }] }}
        >
          <Icon name="lock" size={18} color={c.textSecondary} />
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Icon name="chevron" size={16} color={c.textSecondary} />
          </View>
        </Animated.View>
      )}

      {inPanel && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 4, paddingTop: space[3], paddingHorizontal: space[3], paddingBottom: space[3] + insets.bottom, gap: space[3], backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: c.divider }}>
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            {phase === 'locked' && <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger, opacity: blink }} />}
            <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.medium, fontVariant: ['tabular-nums'], minWidth: 44 }}>
              {fmt(phase === 'review' && (pst.playing || pst.currentTime > 0) ? pst.currentTime * 1000 : elapsed)}
            </Text>
            <View style={{ flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: phase === 'review' ? 'space-between' : 'flex-end', gap: phase === 'review' ? 0 : 3, overflow: 'hidden' }}>
              {phase === 'review' ? <Bars values={reviewBars} color={c.primary} dim={c.textSecondary} progress={reviewRatio} /> : <Bars values={levels} color={c.textSecondary} dim={c.textSecondary} />}
            </View>
          </View>
          <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Discard recording"
              onPress={() => (phase === 'review' ? leaveReview() : requestFinish(false))}
              style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.hover : c.surfaceSubtle })}
            >
              <Icon name="trash" color={c.danger} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={phase === 'locked' ? 'Pause recording' : phase === 'paused' ? 'Resume recording' : pst.playing ? 'Pause playback' : 'Play recording'}
              onPress={phase === 'locked' ? pauseRec : phase === 'paused' ? resumeRec : toggleReview}
              style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], backgroundColor: pressed ? c.hover : c.surfaceSubtle })}
            >
              <Icon name={phase === 'locked' ? 'pause' : phase === 'paused' ? 'mic' : pst.playing ? 'pause' : 'play'} color={phase === 'paused' ? c.danger : c.text} />
              <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.medium }}>
                {phase === 'locked' ? 'Pause' : phase === 'paused' ? 'Resume' : pst.playing ? 'Pause' : 'Play'}
              </Text>
            </Pressable>
            {phase === 'paused' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Listen before sending"
                onPress={listen}
                style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.hover : c.surfaceSubtle })}
              >
                <Icon name="play" color={c.text} />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send voice message"
              onPress={() => (phase === 'review' ? sendReview() : requestFinish(true))}
              style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, opacity: pressed ? 0.92 : 1 })}
            >
              <Icon name="send" color={c.onPrimary} />
            </Pressable>
          </View>
        </View>
      )}

      {!inPanel && (
        <View style={{ zIndex: 2, width: control.md, height: control.md }}>
          {phase === 'holding' && (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: radius.full, backgroundColor: c.primary, opacity: haloOpacity, transform: [{ scale: haloScale }] }} />
          )}
          <Animated.View
            {...pan.panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Record voice message. Hold to record, release to send."
            style={{ width: control.md, height: control.md, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: drag.x }, { translateY: drag.y }, { scale: phase === 'holding' ? 1.25 : 1 }] }}
          >
            <Icon name="mic" color={c.onPrimary} />
          </Animated.View>
        </View>
      )}
    </>
  );
}
