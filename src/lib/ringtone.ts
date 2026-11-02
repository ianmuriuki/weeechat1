import { Platform, Vibration } from 'react-native';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

const RING = require('../../assets/sounds/ring.wav');
const BACK = require('../../assets/sounds/ringback.wav');

let player: AudioPlayer | null = null;
let current: 'ring' | 'ringback' | null = null;

// Loops the incoming ring (with vibration) or the outgoing ringback until stopRing is called.
export function startRing(kind: 'ring' | 'ringback') {
  if (current === kind) return;
  stopRing();
  current = kind;
  try {
    player = createAudioPlayer(kind === 'ring' ? RING : BACK);
    player.loop = true;
    player.play();
  } catch {}
  if (kind === 'ring' && Platform.OS !== 'web') Vibration.vibrate([0, 800, 600, 800, 1400], true);
}

export function stopRing() {
  current = null;
  try {
    player?.pause();
    player?.remove();
  } catch {}
  player = null;
  if (Platform.OS !== 'web') Vibration.cancel();
}
