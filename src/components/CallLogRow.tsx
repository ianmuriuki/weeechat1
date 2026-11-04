import { Pressable, Text, View } from 'react-native';
import { Icon } from '../lib/icons';
import { useCall } from '../lib/call';
import { useTheme } from '../hooks/useTheme';
import type { Message } from '../lib/chat';
import { timeLabel } from './MessageBubble';
import { font } from '../theme/type';

const pad = (n: number) => String(n).padStart(2, '0');

// One call entry in the chat. Your calls sit on the right, theirs on the left, like messages.
// The body is "kind|status|seconds", built in ChatScreen from the calls table.
export function CallLogRow({ message, userId }: { message: Message; userId: string }) {
  const { c } = useTheme();
  const call = useCall();
  const [kind, status, secs] = (message.body ?? '').split('|');
  const video = kind === 'video';
  const mine = message.sender_id === userId;
  const s = Number(secs) || 0;
  const label = video ? 'video call' : 'voice call';
  const missed = status === 'missed' && !mine;
  const title = missed ? 'Missed ' + label : video ? 'Video call' : 'Voice call';
  const sub =
    status === 'ended' ? (mine ? 'Outgoing' : 'Incoming') + ', ' + pad(Math.floor(s / 60)) + ':' + pad(s % 60)
    : status === 'declined' ? (mine ? 'Declined' : 'You declined')
    : mine ? 'No answer'
    : 'Tap to call back';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={(mine ? 'You called. ' : 'They called. ') + title + '. ' + sub + '. Tap to call back'}
      disabled={call.phase !== 'idle'}
      onPress={() => call.start(video ? 'video' : 'audio', message.conversation_id)}
      style={({ pressed }) => ({
        alignSelf: mine ? 'flex-end' : 'flex-start',
        minWidth: 220,
        maxWidth: '85%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: mine ? c.bubbleOutgoing : c.bubbleIncoming,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.overlaySoft }}>
        <Icon name={video ? 'video' : 'phone'} size={20} color={missed ? '#d90035' : c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: missed ? '#d90035' : c.text, fontSize: 14, fontFamily: font.semibold }}>{title}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 12, fontFamily: font.regular }}>{sub}</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 10, fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>{timeLabel(message.created_at)}</Text>
    </Pressable>
  );
}
