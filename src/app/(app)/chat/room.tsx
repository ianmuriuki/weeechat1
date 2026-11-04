import ChatScreen from '../../../screens/ChatScreen';
import { useSession } from '../../../lib/session';
import { useLocalSearchParams } from 'expo-router';

// The chat room has no navigation bar, as in WhatsApp. The NavPill hides itself on this route.
export default function Room() {
  const { session } = useSession();
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  if (!session) return null;
  return <ChatScreen userId={session.user.id} conversationId={conversationId} />;
}
