type Client = typeof import('livekit-client');

// Browsers need a secure page (https or localhost) before they allow the camera and microphone.
export function canCall() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
}

let client: Client | null = null;

export function loadLivekit() {
  if (!client) client = require('livekit-client') as Client;
  // The React Native package does not exist in a browser. lk is a placeholder that web code never touches.
  return { lk: undefined as unknown as typeof import('@livekit/react-native'), client };
}

export async function setSpeakerOutput(_on: boolean) {
  throw new Error('Speaker control is not available on the web');
}
