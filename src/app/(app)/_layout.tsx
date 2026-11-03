import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useSession } from '../../lib/session';
import { UnreadProvider } from '../../lib/unread';
import { CallProvider } from '../../lib/call';
import { CallUI } from '../../components/CallUI';
import { useTheme } from '../../hooks/useTheme';
import { DesktopShell } from '../../components/DesktopShell';
import { NavPill } from '../../components/weee/NavPill';

// The default bottom bar is hidden. On phones the floating NavPill takes its place.
function AppTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="chat" options={{ title: 'Chats' }} />
      <Tabs.Screen name="weee" options={{ title: 'weee' }} />
      <Tabs.Screen name="calls" options={{ title: 'Calls' }} />
      <Tabs.Screen name="media" options={{ title: 'Media' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="admin" options={{ href: null }} />
      <Tabs.Screen name="invites" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppLayout() {
  const { session, loading, needsProfile } = useSession();
  const { c } = useTheme();
  const { width } = useWindowDimensions();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.chatCanvas, justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!session || needsProfile) return <Redirect href="/sign-in" />;

  return (
    <UnreadProvider userId={session.user.id}>
      <CallProvider userId={session.user.id}>
        {width > 820 ? (
          <DesktopShell userId={session.user.id} />
        ) : (
          <View style={{ flex: 1 }}>
            <AppTabs />
            <NavPill />
          </View>
        )}
        <CallUI />
      </CallProvider>
    </UnreadProvider>
  );
}
