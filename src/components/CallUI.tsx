import { createElement, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Primitives';
import { Icon, type IconName } from '../lib/icons';
import { useCall } from '../lib/call';
import { loadLivekit } from '../lib/livekit';
import { useWeee } from '../theme/weee';
import { font } from '../theme/type';

const pad = (n: number) => String(n).padStart(2, '0');
const BG = '#0b141a';
const RED = '#d90035';

function Ctl({ icon, label, on, red, disabled, onPress }: { icon: IconName; label: string; on?: boolean; red?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, width: 76, opacity: disabled ? 0.4 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!on, disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: red ? RED : on ? '#ffffff' : 'rgba(255,255,255,0.12)',
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <Icon name={icon} size={28} color={on ? BG : '#ffffff'} />
      </Pressable>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: font.regular }}>{label}</Text>
    </View>
  );
}

function Big({ icon, label, color, onPress }: { icon: IconName; label: string; color: string; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: color, transform: [{ scale: pressed ? 0.95 : 1 }] })}
      >
        <Icon name={icon} size={32} color="#ffffff" />
      </Pressable>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontFamily: font.regular }}>{label}</Text>
    </View>
  );
}

// Browser video: the track attaches to a normal video element.
function WebVideo({ track, mirror }: { track: RemoteVideoTrack | LocalVideoTrack; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted: true,
    style: { width: '100%', height: '100%', objectFit: 'cover', transform: mirror ? 'scaleX(-1)' : undefined },
  });
}

// Full screen call view. Incoming, calling, ringing, connecting and live. A minimised call leaves a green bar.
export function CallUI() {
  const c = useCall();
  const { w } = useWeee();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => Date.now());
  const [mini, setMini] = useState(false);

  useEffect(() => {
    if (c.phase !== 'live') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [c.phase]);

  useEffect(() => {
    if (c.phase === 'idle' || c.phase === 'incoming') setMini(false);
  }, [c.phase]);

  if (c.phase === 'idle') return null;

  const peer = c.call?.peer;
  const name = peer?.display_name?.trim() || 'Contact';
  const isVideo = c.call?.kind === 'video';
  const secs = c.connectedAt ? Math.max(0, Math.floor((now - c.connectedAt) / 1000)) : 0;
  const clock = pad(Math.floor(secs / 60)) + ':' + pad(secs % 60);
  const status =
    c.phase === 'incoming' ? (isVideo ? 'Incoming video call' : 'Incoming voice call')
    : c.phase === 'outgoing' ? (c.ringing ? 'Ringing' : 'Calling')
    : c.phase === 'connecting' ? 'Connecting'
    : clock;
  const isWeb = Platform.OS === 'web';
  const live = c.phase === 'live';
  const showVideo = live && !!c.remoteVideo;
  const showSelf = live && c.camOn && !!c.localVideo;
  const VideoView = !isWeb && (showVideo || showSelf) ? loadLivekit().lk.VideoView : null;
  const size = Math.min(240, Math.round(width * 0.55));

  if (mini && c.phase !== 'incoming') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Return to call"
        onPress={() => setMini(false)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: '#1f9d55', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: font.semibold }}>Tap to return to call</Text>
        <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>{live ? clock : status}</Text>
      </Pressable>
    );
  }

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => { if (c.phase !== 'incoming') setMini(true); }}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        {showVideo && isWeb && (
          <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
            <WebVideo track={c.remoteVideo!} />
          </View>
        )}
        {showVideo && VideoView && <VideoView style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} videoTrack={c.remoteVideo!} objectFit="cover" />}

        <View style={{ flex: 1, paddingTop: insets.top + 12 }}>
          <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
            {c.phase !== 'incoming' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Minimise call"
                onPress={() => setMini(true)}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}
              >
                <Icon name="chevronDown" size={24} color="#ffffff" />
              </Pressable>
            ) : (
              <View style={{ width: 44 }} />
            )}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text numberOfLines={1} style={{ color: '#ffffff', fontSize: 20, fontFamily: font.semibold }}>{name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontFamily: font.regular, fontVariant: ['tabular-nums'], marginTop: 2 }}>{status}</Text>
            </View>
            <View style={{ width: 44 }} />
          </View>

          {showSelf && (
            <View style={{ position: 'absolute', top: insets.top + 84, right: 16, width: 104, height: 148, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1d2428', zIndex: 2 }}>
              {isWeb ? <WebVideo track={c.localVideo!} mirror /> : VideoView && <VideoView style={{ flex: 1 }} videoTrack={c.localVideo!} objectFit="cover" mirror />}
            </View>
          )}

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            {!showVideo && <Avatar name={peer?.display_name || '?'} diameter={size} color={w.moss} path={peer?.avatar_path} />}
            {c.phase === 'incoming' && !c.supported && (
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: font.regular, textAlign: 'center', maxWidth: 300, marginTop: 20 }}>
                This app cannot take calls here. Open the web app in your browser, or use the newest build.
              </Text>
            )}
          </View>

          {c.phase === 'incoming' ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 40, paddingBottom: insets.bottom + 40 }}>
              <Big icon="endCall" label="Decline" color={RED} onPress={c.decline} />
              {c.supported && <Big icon="phone" label="Accept" color="#1f9d55" onPress={c.accept} />}
            </View>
          ) : (
            <View
              style={{
                alignSelf: 'center',
                width: '100%',
                maxWidth: 440,
                marginBottom: insets.bottom + 12,
                paddingVertical: 22,
                paddingHorizontal: 12,
                borderRadius: 32,
                backgroundColor: 'rgba(23,34,42,0.96)',
                flexDirection: 'row',
                justifyContent: 'space-around',
              }}
            >
              {!isWeb && <Ctl icon="speaker" label="Speaker" on={c.speaker} disabled={!live} onPress={c.toggleSpeaker} />}
              <Ctl icon="video" label="Video" on={c.camOn} disabled={!live} onPress={c.toggleCamera} />
              <Ctl icon={c.muted ? 'mute' : 'mic'} label={c.muted ? 'Unmute' : 'Mute'} on={c.muted} disabled={!live} onPress={c.toggleMute} />
              <Ctl icon="endCall" label={live ? 'End' : 'Cancel'} red onPress={c.hangup} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
