import ChatScreen from '../../../screens/ChatScreen';
import { useSession } from '../../../lib/session';
import { useLocalSearchParams } from 'expo-router';

// The chat room has no navigation bar, as in WhatsApp. The NavPill hides itself on this route.
export default function Room() {
  const { session } = useSession();
  const { conversationId, call, search } = useLocalSearchParams<{ conversationId?: string; call?: 'audio' | 'video'; search?: string }>();
  if (!session) return null;
  return <ChatScreen userId={session.user.id} conversationId={conversationId} initialAction={call ?? (search ? 'search' : undefined)} />;
}
