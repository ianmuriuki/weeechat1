import { AppState, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Remote push needs a real Android build. Expo Go and the web are skipped.
export function canPush() {
  if (Platform.OS !== 'android' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  // An older development client may not contain the native module yet. Importing the package would crash.
  return requireOptionalNativeModule('ExpoTopicSubscriptionModule') != null;
}

let mod: Promise<typeof import('expo-notifications')> | null = null;
export function loadNotifications() {
  if (!mod) mod = import('expo-notifications');
  return mod;
}

// The chat screen reports when it is on screen, so a message you can already see does not also pop up.
let chatOpen = false;
export function setChatOpen(open: boolean) {
  chatOpen = open;
}

// Android fixes a channel's sound and vibration when it is created, so the alerts channel is new.
export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  const N = await loadNotifications();
  await N.setNotificationChannelAsync('messages_v2', { name: 'Messages', importance: N.AndroidImportance.HIGH, sound: 'default', enableVibrate: true, vibrationPattern: [0, 250, 250, 250] });
  await N.deleteNotificationChannelAsync('messages').catch(() => {});
  await N.deleteNotificationChannelAsync('alerts').catch(() => {});
  await N.setNotificationChannelAsync('alerts_v2', { name: 'Shared activity and alerts', importance: N.AndroidImportance.HIGH, sound: 'default', enableVibrate: true, vibrationPattern: [0, 250, 250, 250] });
  await N.setNotificationChannelAsync('workout', { name: 'Workout in progress', importance: N.AndroidImportance.LOW });
  await N.setNotificationChannelAsync('calls', {
    name: 'Calls',
    importance: N.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 800, 600, 800, 600, 800, 600, 800],
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: { usage: N.AndroidAudioUsage.NOTIFICATION_RINGTONE, contentType: N.AndroidAudioContentType.SONIFICATION },
  });
}

// Clears message and shared activity notifications from the tray. The running workout notification stays.
export async function clearNotifications(only?: string[], conversationId?: string) {
  if (!canPush()) return;
  try {
    const N = await loadNotifications();
    const shown = await N.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => {
          const data = n.request.content.data as { type?: string; conversationId?: string } | undefined;
          return n.request.identifier !== 'workout-running'
            && data?.type !== 'workout-running'
            && (!only || (!!data?.type && only.includes(data.type)))
            && (!conversationId || data?.conversationId === conversationId);
        })
        .map((n) => N.dismissNotificationAsync(n.request.identifier)),
    );
  } catch {}
}

let handlerSet = false;
async function initHandler() {
  if (handlerSet) return;
  const N = await loadNotifications();
  N.setNotificationHandler({
    handleNotification: async (notification) => {
      const type = (notification.request.content.data as { type?: string } | undefined)?.type;
      if (type === 'call' && AppState.currentState === 'active') return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };
      if (type === 'workout-running') return { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
      const hide = type === 'message' && chatOpen && AppState.currentState === 'active';
      return { shouldShowBanner: !hide, shouldShowList: !hide, shouldPlaySound: !hide, shouldSetBadge: false };
    },
  });
  handlerSet = true;
}

const TOKEN_KEY = 'weeez.pushToken';
let registeredToken: string | null = null;

export async function registerForPush(): Promise<string | null> {
  if (!canPush()) return null;
  try {
    const N = await loadNotifications();
    await initHandler();
    // Android 13 and later only show the permission prompt once a channel exists.
    await ensureChannels();
    await N.setNotificationCategoryAsync('call', [
      { identifier: 'decline', buttonTitle: 'Decline', options: { opensAppToForeground: true } },
      { identifier: 'accept', buttonTitle: 'Answer', options: { opensAppToForeground: true } },
    ]);
    const cur = await N.getPermissionsAsync();
    let granted = cur.granted;
    if (!granted && cur.canAskAgain) granted = (await N.requestPermissionsAsync()).granted;
    if (!granted) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error('Project ID not found');
    const { data } = await N.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: data });
    if (error) throw error;
    registeredToken = data;
    AsyncStorage.setItem(TOKEN_KEY, data).catch(() => {});
    return data;
  } catch (e) {
    console.warn('push registration failed', e);
    return null;
  }
}

// To be called just before signing out, so this phone stops receiving that account's messages.
export async function unregisterPush() {
  let token = registeredToken;
  registeredToken = null;
  try {
    if (!token) token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
    if (!error) await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sign out must never wait on this.
  }
}

// Stops this phone receiving the account's pushes, then signs out. The wait is capped so sign out never hangs.
export async function signOutAndUnregister() {
  await Promise.race([unregisterPush(), new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
  await supabase.auth.signOut();
}
