import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!url || !key || url.startsWith('PASTE') || key.startsWith('PASTE')) {
  throw new Error('Supabase env vars missing. Fill in .env, then restart with: npx expo start --clear');
}

// Web static rendering runs on a server with no window, so skip storage there.
const isServer = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(url, key, {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: !isServer,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// On phones, pause token refresh when the app is in the background.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
