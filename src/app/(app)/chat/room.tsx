import ChatScreen from '../../../screens/ChatScreen';
import { useSession } from '../../../lib/session';

// The chat room has no navigation bar, as in WhatsApp. The NavPill hides itself on this route.
export default function Room() {
  const { session } = useSession();
  if (!session) return null;
  return <ChatScreen userId={session.user.id} />;
}
