import { useCallback, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatScreen from '../../../screens/ChatScreen';
import { Avatar } from '../../../components/Primitives';
import { Logo } from '../../../components/Logo';
import { Ticks } from '../../../components/Ticks';
import { timeLabel } from '../../../components/MessageBubble';
import { Icon } from '../../../lib/icons';
import { fetchConversationSummaries, type ConversationSummary } from '../../../lib/chat';
import { useSession } from '../../../lib/session';
import { useTheme } from '../../../hooks/useTheme';
import { space, fontSize, radius } from '../../../theme/tokens';
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
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setConversations(await fetchConversationSummaries(userId));
    } catch {
      setError("Couldn't load chats. Try again.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function preview(last: ConversationSummary['last']) {
    if (!last) return 'No messages yet';
    if (last.deleted_at) return 'This message was deleted';
    if (last.kind === 'image') return 'Photo';
    if (last.kind === 'file') return 'File';
    if (last.kind === 'voice') return 'Voice message';
    return last.body ?? '';
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
      <View style={{ height: 64, paddingHorizontal: space[5], flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Logo size={28} stroke={c.primary} fill={c.surface} />
        <Text style={{ color: c.primary, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.4 }}>Weeez</Text>
      </View>
      {loading ? (
        <View style={{ paddingHorizontal: space[5], gap: space[4] }}>
          {[0, 1, 2].map((item) => <View key={item} style={{ height: 64, borderRadius: radius.md, backgroundColor: c.surfaceSubtle }} />)}
        </View>
      ) : error ? (
        <View style={{ alignItems: 'center', paddingHorizontal: space[5], paddingTop: space[10], gap: space[3] }}>
          <Icon name="lock" size={30} color={c.textSecondary} />
          <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>Chats are unavailable</Text>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={load} style={{ minHeight: 44, paddingHorizontal: space[5], borderRadius: radius.full, borderWidth: 1, borderColor: c.divider, justifyContent: 'center' }}>
            <Text style={{ color: c.primary, fontSize: fontSize.label, fontFamily: font.semibold }}>Try again</Text>
          </Pressable>
        </View>
      ) : conversations.length === 0 ? (
        <View style={{ alignItems: 'center', paddingHorizontal: space[5], paddingTop: space[10], gap: space[3] }}>
          <Icon name="chat" size={30} color={c.textSecondary} />
          <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>No chats yet</Text>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>Add a friend to start a conversation.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/friends' as never)} style={{ minHeight: 44, paddingHorizontal: space[5], borderRadius: radius.full, backgroundColor: c.primary, justifyContent: 'center' }}>
            <Text style={{ color: c.onPrimary, fontSize: fontSize.label, fontFamily: font.semibold }}>Find a friend</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          {conversations.map((conversation) => {
            const name = conversation.kind === 'direct' ? conversation.other?.display_name ?? 'Chat' : conversation.title ?? 'Group chat';
            const mine = conversation.last?.sender_id === userId;
            const tick = conversation.last?.read_at ? 'read' : conversation.last?.delivered_at ? 'delivered' : 'sent';
            return (
              <Pressable
                key={conversation.id}
                accessibilityRole="button"
                accessibilityLabel={'Open chat with ' + name}
                onPress={() => router.push(('/chat/room?conversationId=' + conversation.id) as never)}
                style={({ pressed }) => ({ minHeight: 76, paddingVertical: 10, paddingHorizontal: space[5], flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: pressed ? c.hover : 'transparent' })}
              >
                <Avatar name={name} color={c.avatarIann} path={conversation.kind === 'direct' ? conversation.other?.avatar_path : conversation.avatar_path} />
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontSize: 15, fontFamily: font.semibold }}>{name}</Text>
                    {conversation.last && <Text style={{ color: conversation.unread > 0 ? c.primary : c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{shortWhen(conversation.last.created_at)}</Text>}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      {mine && <Ticks state={tick} />}
                      <Text numberOfLines={1} style={{ flex: 1, color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{preview(conversation.last)}</Text>
                    </View>
                    {conversation.unread > 0 && <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.onAccent, fontSize: fontSize.caption, fontFamily: font.semibold }}>{conversation.unread > 99 ? '99+' : conversation.unread}</Text></View>}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
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
