import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';
import { Avatar } from './Primitives';
import { useSignedUrl, type MediaRow } from '../lib/media';
import type { Message } from '../lib/chat';
import { font } from '../theme/type';

const BARS = 34;
let active: AudioPlayer | null = null;

function fmt(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) | 0;
    return ((h >>> 0) % 1000) / 1000;
  };
}

export function VoiceContent({
  message, media, mine, senderName, senderAvatar, onLongPress,
}: {
  message: Message;
  media?: MediaRow;
  mine: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  onLongPress?: () => void;
}) {
  const { c } = useTheme();
  const local = message.local?.picked;
  const url = useSignedUrl(local ? null : media?.storage_path);
  const uri = local?.uri ?? url;
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const [w, setW] = useState(0);

  const totalMs = media?.duration_ms ?? local?.durationMs ?? 0;
  const dur = status.duration > 0 ? status.duration : totalMs / 1000;
  const pos = status.currentTime || 0;
  const ratio = dur > 0 ? Math.min(1, pos / dur) : 0;

  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish, player]);

  const bars = useMemo(() => {
    const src = media?.waveform ?? local?.waveform;
    if (src && src.length) return Array.from({ length: BARS }, (_, i) => Math.min(1, Math.max(0, src[Math.floor((i * src.length) / BARS)] / 100)));
    const rand = seeded(message.id);
    return Array.from({ length: BARS }, () => 0.2 + rand() * 0.7);
  }, [media?.waveform, local?.waveform, message.id]);

  function toggle() {
    if (!uri) return;
    if (status.playing) {
      player.pause();
      return;
    }
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    if (active && active !== player) {
      try {
        active.pause();
      } catch {
        // The other player is already gone.
      }
    }
    active = player;
    player.play();
  }

  function seek(x: number) {
    if (!uri || w <= 0 || dur <= 0) return;
    player.seekTo(Math.min(dur, Math.max(0, (x / w) * dur)));
  }

  const showDot = ratio > 0 || status.playing;

  return (
    <View style={{ minWidth: 262, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2, paddingBottom: 16, opacity: message.pending ? 0.6 : 1 }}>
      <View style={{ width: 44, height: 44 }}>
        <Avatar name={senderName || '?'} diameter={44} color={c.avatarIann} path={senderAvatar} />
        <View style={{ position: 'absolute', right: -4, bottom: -2, borderRadius: 9, padding: 1, backgroundColor: mine ? c.bubbleOutgoing : c.bubbleIncoming }}>
          <Icon name="mic" size={16} color={c.accent} />
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
        onPress={toggle}
        onLongPress={onLongPress}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={status.playing ? 'pause' : 'play'} size={28} color={c.textSecondary} />
      </Pressable>
      <Pressable
        accessibilityLabel="Voice message position"
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onPress={(e) => seek(e.nativeEvent.locationX)}
        onLongPress={onLongPress}
        style={{ flex: 1, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        {bars.map((v, i) => {
          const played = i / BARS < ratio;
          return <View key={i} style={{ width: 3, height: 3 + v * 24, borderRadius: 2, backgroundColor: played ? c.primary : c.textSecondary, opacity: played ? 1 : 0.5 }} />;
        })}
        {showDot && <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, ratio * (w - 10)), top: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary }} />}
      </Pressable>
      <Text style={{ position: 'absolute', left: 96, bottom: 0, color: c.textSecondary, fontSize: 10, fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>
        {fmt(status.playing || pos > 0 ? pos : dur)}
      </Text>
    </View>
  );
}
