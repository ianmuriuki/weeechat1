import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../lib/session';
import { UnreadProvider } from '../../lib/unread';
import { InboxProvider } from '../../lib/inbox';
import { useAppUpdates } from '../../lib/appUpdates';
import { WeeLinkProvider } from '../../lib/weeLink';
import { CallProvider } from '../../lib/call';
import { CallUI } from '../../components/CallUI';
import { useTheme } from '../../hooks/useTheme';
import { DesktopShell } from '../../components/DesktopShell';
import { NavPill } from '../../components/weee/NavPill';

function AppStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function AppLayout() {
  const { session, loading, needsProfile } = useSession();
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  useAppUpdates();

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
      <InboxProvider userId={session.user.id}>
      <WeeLinkProvider userId={session.user.id}>
      <CallProvider userId={session.user.id}>
        {width > 820 ? (
          <DesktopShell userId={session.user.id} />
        ) : (
          <View style={{ flex: 1 }}>
            <AppStack />
            <NavPill />
          </View>
        )}
        <CallUI />
      </CallProvider>
      </WeeLinkProvider>
      </InboxProvider>
    </UnreadProvider>
  );
}
