import { useCallback } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatScreen from '../../../screens/ChatScreen';
import { Avatar } from '../../../components/Primitives';
import { Logo } from '../../../components/Logo';
import { Ticks } from '../../../components/Ticks';
import { timeLabel } from '../../../components/MessageBubble';
import { Icon } from '../../../lib/icons';
import { useSession } from '../../../lib/session';
import { useUnread } from '../../../lib/unread';
import { useTheme } from '../../../hooks/useTheme';
import { space, fontSize } from '../../../theme/tokens';
import { font } from '../../../theme/type';

function shortWhen(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
    ? timeLabel(iso)
    : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function ChatList({ userId }: { userId: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { unread, last, partner, partnerTyping, resync } = useUnread();

  // Catch up every time the list comes back into view.
  useFocusEffect(
    useCallback(() => {
      resync();
    }, [resync]),
  );

  const mine = !!last && last.sender_id === userId;
  const showTicks = mine && !last.deleted_at && !partnerTyping;
  const tick = last?.read_at ? 'read' : last?.delivered_at ? 'delivered' : 'sent';
  const preview = last
    ? last.deleted_at
      ? 'This message was deleted'
      : last.kind === 'image' ? 'Photo'
      : last.kind === 'file' ? 'File'
      : last.kind === 'voice' ? 'Voice message'
      : (last.body ?? '')
    : 'No messages yet';

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <View style={{ height: 64, paddingHorizontal: space[5], flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Logo size={28} stroke={c.primary} fill={c.surface} />
        <Text style={{ color: c.primary, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.4 }}>weeechat</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Open chat with ' + (partner?.display_name ?? 'your person')}
        onPress={() => router.push('/chat/room' as never)}
        style={({ pressed }) => ({ minHeight: 76, paddingVertical: 10, paddingHorizontal: space[5], flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: pressed ? c.hover : 'transparent' })}
      >
        <Avatar name={partner?.display_name || '?'} color={c.avatarIann} path={partner?.avatar_path} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontSize: 15, fontFamily: font.semibold }}>{partner?.display_name || 'Your person'}</Text>
            {last && <Text style={{ color: unread > 0 ? c.primary : c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{shortWhen(last.created_at)}</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              {showTicks && <Ticks state={tick} />}
              <Text numberOfLines={1} style={{ flex: 1, color: partnerTyping ? c.primary : c.textSecondary, fontSize: fontSize.label, fontFamily: partnerTyping ? font.medium : font.regular }}>
                {partnerTyping ? 'typing' : (mine && !last?.deleted_at && last?.kind === 'text' ? '' : '') + preview}
              </Text>
            </View>
            {unread > 0 && (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.onAccent, fontSize: fontSize.caption, fontFamily: font.semibold }}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
      <View style={{ marginTop: space[8], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        <Icon name="lock" size={14} color={c.textSecondary} />
        <Text style={{ color: c.textSecondary, fontSize: fontSize.caption, fontFamily: font.regular }}>Your private space, for just two.</Text>
      </View>
    </View>
  );
}

export default function ChatsIndex() {
  const { width } = useWindowDimensions();
  const { session } = useSession();
  if (!session) return null;
  // Wide screens use the desktop shell, where the chat fills the right pane.
  if (width > 820) return <ChatScreen userId={session.user.id} />;
  return <ChatList userId={session.user.id} />;
}
