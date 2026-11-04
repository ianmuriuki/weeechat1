import { Redirect, useLocalSearchParams } from 'expo-router';
import { SharedMedia } from '../../components/SharedMedia';

export default function Media() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  if (!conversationId) return <Redirect href="/chat" />;
  return <SharedMedia variant="page" conversationId={conversationId} />;
}
