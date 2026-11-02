import { NativeModules, Platform } from 'react-native';

type LK = typeof import('@livekit/react-native');
type Client = typeof import('livekit-client');

// The native WebRTC code only exists in a build made after the LiveKit packages were added.
// Older builds and the web skip calls instead of crashing.
export function canCall() {
  return Platform.OS === 'android' && (NativeModules as Record<string, unknown>).WebRTCModule != null;
}

let cached: { lk: LK; client: Client } | null = null;

// Loaded on first use, never at app start.
export function loadLivekit() {
  if (!cached) {
    const lk = require('@livekit/react-native') as LK;
    lk.registerGlobals();
    const client = require('livekit-client') as Client;
    cached = { lk, client };
  }
  return cached;
}

// Best effort speaker or earpiece switch. Output names differ between builds, so they are looked up.
export async function setSpeakerOutput(on: boolean) {
  const { lk } = loadLivekit();
  const s = lk.AudioSession as unknown as { getAudioOutputs?: () => Promise<string[]>; selectAudioOutput?: (id: string) => Promise<void> };
  if (typeof s.selectAudioOutput !== 'function') throw new Error('Speaker control is not available');
  const outs = typeof s.getAudioOutputs === 'function' ? await s.getAudioOutputs() : [];
  const pick = on ? outs.find((o) => /speaker/i.test(o)) ?? 'speaker' : outs.find((o) => /earpiece|handset|receiver/i.test(o)) ?? 'earpiece';
  await s.selectAudioOutput(pick);
}
