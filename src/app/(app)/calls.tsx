import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Primitives';
import { Icon } from '../../lib/icons';
import { useCall } from '../../lib/call';
import { useSession } from '../../lib/session';
import { useWeee } from '../../theme/weee';
import { font } from '../../theme/type';
import type { CallRow } from '../../lib/calls';

const pad = (n: number) => String(n).padStart(2, '0');

function describe(c: CallRow, uid: string) {
  const mine = c.caller_id === uid;
  let text = mine ? 'Outgoing' : 'Incoming';
  if (c.status === 'missed') text = mine ? 'No answer' : 'Missed';
  else if (c.status === 'declined') text = mine ? 'Declined' : 'You declined';
  else if (c.answered_at && c.ended_at) {
    const s = Math.max(0, Math.round((new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000));
    text += ', ' + pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }
  return text + (c.kind === 'video' ? ', video' : ', voice');
}

export default function Calls() {
  const { w } = useWeee();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const call = useCall();
  const uid = session?.user.id ?? '';
  const busy = call.phase !== 'idle';
  const off = !call.supported || busy;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: w.paper }} contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100, paddingHorizontal: 20, gap: 16 }}>
      <Text accessibilityRole="header" style={{ color: w.ink, fontSize: 32, lineHeight: 36, fontFamily: font.semibold, letterSpacing: -0.64 }}>Calls</Text>

      {!call.supported && (
        <Text style={{ color: w.ink + 'b3', fontSize: 14, fontFamily: font.regular }}>
          {Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? 'Expo Go cannot make calls. Use the web app in your phone browser, or install a development build.' : Platform.OS === 'android' ? 'This build was made before calls were added. Install the newest build to call.' : Platform.OS === 'web' ? 'Calls in the browser need a secure page: use localhost or https.' : 'Calls are not available on this device.'}
        </Text>
      )}
      {!!call.notice && (
        <Pressable accessibilityRole="alert" onPress={call.clearNotice}>
          <Text style={{ color: '#d90035', fontSize: 14, fontFamily: font.regular }}>{call.notice}</Text>
        </Pressable>
      )}

      <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.semibold, marginTop: 8 }}>Recent</Text>
      {call.history.length === 0 ? (
        <Text style={{ color: w.ink + 'b3', fontSize: 14, fontFamily: font.regular }}>No calls yet.</Text>
      ) : (
        call.history.map((c) => {
          const missed = c.status === 'missed' && c.caller_id !== uid;
          const name = c.peer?.display_name?.trim() || 'Contact';
          return (
            <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={'Call ' + name + ' again'} disabled={off} onPress={() => call.start(c.kind, c.conversation_id)} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: w.ink + '14', opacity: off ? 0.5 : 1 }}>
              <Avatar name={name} diameter={44} color={w.moss} path={c.peer?.avatar_path} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: missed ? '#d90035' : w.ink, fontSize: 15, fontFamily: font.semibold }}>{name}</Text>
                <Text style={{ color: w.ink + '99', fontSize: 12, fontFamily: font.regular }}>{describe(c, uid) + ', ' + new Date(c.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              <Icon name={c.kind === 'video' ? 'video' : 'phone'} size={22} color={missed ? '#d90035' : w.ink} />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}
