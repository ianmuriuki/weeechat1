import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { LocalVideoTrack, RemoteVideoTrack, Room } from 'livekit-client';
import { supabase } from './supabase';
import { getConversationId } from './chat';
import { answerCall, endCall, fetchCallToken, startCall, type CallKind, type CallRow } from './calls';
import { canCall, loadLivekit, setSpeakerOutput } from './livekit';
import { startRing, stopRing } from './ringtone';
import { onCallAction, takeCallAction } from './callAction';

export type Phase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'live';

type Ctx = {
  supported: boolean;
  phase: Phase;
  call: CallRow | null;
  muted: boolean;
  camOn: boolean;
  speaker: boolean;
  remoteVideo: RemoteVideoTrack | null;
  localVideo: LocalVideoTrack | null;
  connectedAt: number | null;
  ringing: boolean;
  notice: string;
  history: CallRow[];
  start: (kind: CallKind) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  clearNotice: () => void;
};

const noop = async () => {};
const CallContext = createContext<Ctx>({
  supported: false, phase: 'idle', call: null, muted: false, camOn: false, speaker: false, remoteVideo: null, localVideo: null,
  connectedAt: null, ringing: false, notice: '', history: [], start: noop, accept: noop, decline: noop, hangup: noop,
  toggleMute: () => {}, toggleCamera: () => {}, toggleSpeaker: () => {}, clearNotice: () => {},
});

const COLS = 'id, conversation_id, caller_id, kind, status, created_at, answered_at, ended_at, ringing_at';
const RING_MS = 45000;
const DONE = ['ended', 'declined', 'missed'];
type WithRinging = CallRow & { ringing_at?: string | null };

function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : '';
  if (/call in progress/i.test(m)) return 'A call is already in progress.';
  if (/no longer ringing/i.test(m)) return 'The call has ended.';
  return "Couldn't connect the call. Try again.";
}

export function CallProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const supported = canCall();
  const [phase, setPhase] = useState<Phase>('idle');
  const [call, setCall] = useState<CallRow | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [remoteVideo, setRemoteVideo] = useState<RemoteVideoTrack | null>(null);
  const [localVideo, setLocalVideo] = useState<LocalVideoTrack | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<CallRow[]>([]);
  const [ringing, setRinging] = useState(false);

  const cid = useRef<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const callRef = useRef<CallRow | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const mutedRef = useRef(false);
  const camRef = useRef(false);
  const speakerRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const put = useCallback((c: CallRow | null) => {
    callRef.current = c;
    setCall(c);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!cid.current) return;
    const { data, error } = await supabase.from('calls').select(COLS).eq('conversation_id', cid.current).order('created_at', { ascending: false }).limit(30);
    if (!error) setHistory((data ?? []) as CallRow[]);
  }, []);

  const cleanup = useCallback(async () => {
    clearTimeout(timer.current);
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        await room.disconnect();
      } catch {}
      try {
        if (Platform.OS !== 'web') await loadLivekit().lk.AudioSession.stopAudioSession();
      } catch {}
    }
    mutedRef.current = false;
    camRef.current = false;
    speakerRef.current = false;
    setRemoteVideo(null);
    setLocalVideo(null);
    setConnectedAt(null);
    setMuted(false);
    setCamOn(false);
    setSpeaker(false);
    setRinging(false);
    put(null);
    go('idle');
    loadHistory();
  }, [go, put, loadHistory]);

  const hangup = useCallback(async () => {
    if (phaseRef.current === 'idle') return;
    const c = callRef.current;
    if (c) {
      try {
        await endCall(c.id);
      } catch {}
    }
    await cleanup();
  }, [cleanup]);

  const api = useRef({ hangup, cleanup, loadHistory, connect: async (_c: CallRow) => {}, ring: (_c: CallRow) => {} });

  const connect = useCallback(
    async (c: CallRow) => {
      if (!cid.current) return;
      go('connecting');
      try {
        const { token, url } = await fetchCallToken(cid.current);
        const { lk, client } = loadLivekit();
        if (Platform.OS !== 'web') await lk.AudioSession.startAudioSession();
        const room = new client.Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;
        const syncLocal = () => {
          const pub = room.localParticipant.getTrackPublication(client.Track.Source.Camera);
          setLocalVideo((pub?.videoTrack as LocalVideoTrack | undefined) ?? null);
        };
        room
          .on(client.RoomEvent.TrackSubscribed, (track) => {
            if (track.kind === client.Track.Kind.Video) setRemoteVideo(track as RemoteVideoTrack);
            // In a browser, remote audio plays through a hidden audio element.
            if (Platform.OS === 'web' && track.kind === client.Track.Kind.Audio) {
              const el = track.attach();
              el.style.display = 'none';
              document.body.appendChild(el);
            }
          })
          .on(client.RoomEvent.TrackUnsubscribed, (track) => {
            if (track.kind === client.Track.Kind.Video) setRemoteVideo(null);
            if (Platform.OS === 'web') track.detach().forEach((el) => el.remove());
          })
          .on(client.RoomEvent.LocalTrackPublished, syncLocal)
          .on(client.RoomEvent.LocalTrackUnpublished, syncLocal)
          .on(client.RoomEvent.ParticipantDisconnected, () => {
            if (roomRef.current === room && room.remoteParticipants.size === 0) api.current.hangup();
          })
          .on(client.RoomEvent.Disconnected, () => {
            if (roomRef.current === room && phaseRef.current !== 'idle') api.current.hangup();
          });
        await room.connect(url, token);
        if (roomRef.current !== room) {
          await room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (c.kind === 'video') {
          await room.localParticipant.setCameraEnabled(true);
          camRef.current = true;
          setCamOn(true);
          syncLocal();
        }
        setConnectedAt(Date.now());
        go('live');
        if (c.kind === 'video') {
          setSpeakerOutput(true)
            .then(() => {
              speakerRef.current = true;
              setSpeaker(true);
            })
            .catch(() => {});
        }
      } catch (e) {
        console.warn('call connect failed', e);
        setNotice(friendly(e));
        await api.current.hangup();
      }
    },
    [go],
  );

  const ring = useCallback(
    (c: CallRow) => {
      if (phaseRef.current !== 'idle') return;
      put(c);
      go('incoming');
      supabase.rpc('ack_ringing', { p_call: c.id }).then(() => {}, () => {});
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (phaseRef.current === 'incoming') api.current.cleanup();
      }, RING_MS);
    },
    [go, put],
  );

  api.current = { hangup, cleanup, loadHistory, connect, ring };

  const start = useCallback(
    async (kind: CallKind) => {
      if (phaseRef.current !== 'idle' || !cid.current) return;
      if (!canCall()) {
        setNotice('Calls need the latest build of the app.');
        return;
      }
      setNotice('');
      try {
        const id = await startCall(cid.current, kind);
        const { data, error } = await supabase.from('calls').select(COLS).eq('id', id).single();
        if (error || !data) throw new Error('call not found');
        put(data as CallRow);
        go('outgoing');
        timer.current = setTimeout(() => {
          if (phaseRef.current !== 'outgoing') return;
          setNotice('No answer.');
          api.current.hangup();
        }, RING_MS);
      } catch (e) {
        console.warn('start call failed', e);
        setNotice(friendly(e));
      }
    },
    [go, put],
  );

  const accept = useCallback(async () => {
    const c = callRef.current;
    if (!c || phaseRef.current !== 'incoming') return;
    clearTimeout(timer.current);
    try {
      await answerCall(c.id);
    } catch (e) {
      setNotice(friendly(e));
      await cleanup();
      return;
    }
    await connect({ ...c, status: 'active' });
  }, [cleanup, connect]);

  const decline = useCallback(async () => {
    const c = callRef.current;
    if (c) {
      try {
        await endCall(c.id);
      } catch {}
    }
    await cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    room.localParticipant.setMicrophoneEnabled(!next).catch(() => {});
  }, []);

  const toggleCamera = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !camRef.current;
    camRef.current = next;
    setCamOn(next);
    room.localParticipant.setCameraEnabled(next).catch(() => {});
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerRef.current;
    setSpeakerOutput(next)
      .then(() => {
        speakerRef.current = next;
        setSpeaker(next);
      })
      .catch(() => setNotice('Speaker control is not available on this build.'));
  }, []);

  useEffect(() => {
    let alive = true;
    let ch: RealtimeChannel | null = null;

    const checkRinging = async () => {
      if (!cid.current || phaseRef.current !== 'idle') return;
      const { data } = await supabase.rpc('pending_call', { p_conversation: cid.current });
      const row = Array.isArray(data) ? data[0] : null;
      if (row) api.current.ring(row as CallRow);
    };

    (async () => {
      try {
        const id = await getConversationId();
        if (!alive) return;
        cid.current = id;
        ch = supabase
          .channel('calls:' + id)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: 'conversation_id=eq.' + id }, (payload) => {
            const row = payload.new as CallRow;
            if (row?.id && payload.eventType === 'INSERT') {
              if (row.caller_id !== userId && row.status === 'ringing') api.current.ring(row);
            } else if (row?.id && payload.eventType === 'UPDATE') {
              const cur = callRef.current;
              if (cur && cur.id === row.id) {
                if ((row as WithRinging).ringing_at) setRinging(true);
                if (row.status === 'active' && phaseRef.current === 'outgoing') {
                  clearTimeout(timer.current);
                  callRef.current = row;
                  setCall(row);
                  api.current.connect(row);
                } else if (DONE.includes(row.status) && phaseRef.current !== 'idle') {
                  if (row.status === 'declined') setNotice('Call declined.');
                  api.current.cleanup();
                }
              }
            }
            api.current.loadHistory();
          })
          .subscribe((s) => {
            if (s === 'SUBSCRIBED') {
              checkRinging();
              api.current.loadHistory();
            }
          });
      } catch (e) {
        console.warn('call listener failed', e);
      }
    })();

    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        checkRinging();
        api.current.loadHistory();
      }
    });
    return () => {
      alive = false;
      sub.remove();
      clearTimeout(timer.current);
      if (ch) supabase.removeChannel(ch);
    };
  }, [userId]);

  // Answer or Decline tapped in the notification: apply it once the incoming call is on screen.
  useEffect(() => {
    const run = () => {
      if (phaseRef.current !== 'incoming') return;
      const a = takeCallAction(callRef.current?.id ?? null);
      if (a === 'accept') accept();
      else if (a === 'decline') decline();
    };
    run();
    return onCallAction(run);
  }, [phase, accept, decline]);

  useEffect(() => {
    if (phase === 'incoming') startRing('ring');
    else if (phase === 'outgoing' && ringing) startRing('ringback');
    else stopRing();
  }, [phase, ringing]);

  useEffect(() => stopRing, []);

  return (
    <CallContext.Provider
      value={{
        supported, phase, call, muted, camOn, speaker, remoteVideo, localVideo, connectedAt, ringing, notice, history,
        start, accept, decline, hangup, toggleMute, toggleCamera, toggleSpeaker, clearNotice: () => setNotice(''),
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export const useCall = () => useContext(CallContext);
