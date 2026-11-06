import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WeeePage } from '../../components/weee/WeeePage';
import { WeeeGate } from '../../components/weee/WeeeGate';
import { IconButton } from '../../components/Primitives';
import { useChatWee } from '../../lib/weeLink';
import { useTheme } from '../../hooks/useTheme';
import { useWeee } from '../../theme/weee';

// Wee for one direct chat, opened from that chat's info screen: /weee?conversationId=...
export default function Weee() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  if (!conversationId) return <Redirect href={'/me' as never} />;
  return <WeeeScreen conversationId={conversationId} />;
}

function WeeeScreen({ conversationId }: { conversationId: string }) {
  const { c } = useTheme();
  const { w } = useWeee();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { link, loading } = useChatWee(conversationId);
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!link || link.status !== 'active') return <WeeeGate conversationId={conversationId} />;
  return (
    <View style={{ flex: 1, backgroundColor: w.paper }}>
      <View style={{ paddingTop: insets.top, height: 52 + insets.top, paddingHorizontal: 12, justifyContent: 'center', zIndex: 5, backgroundColor: w.paper }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <IconButton icon="arrowLeft" label="Back to chat" color={w.ink} onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat' as never))} />
        </View>
      </View>
      <WeeePage key={link.link_id} link={link} />
    </View>
  );
}
