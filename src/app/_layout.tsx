import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { SessionProvider } from '../lib/session';
import { LaunchSplash } from '../components/LaunchSplash';
import { PushBridge } from '../components/PushBridge';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <SessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <PushBridge />
          <LaunchSplash />
        </SessionProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
