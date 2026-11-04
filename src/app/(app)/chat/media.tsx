import { Redirect, useLocalSearchParams } from 'expo-router';
import { AllMedia } from '../../../components/AllMedia';

export default function ChatMedia() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  if (!conversationId) return <Redirect href="/chat" />;
  return <AllMedia variant="page" conversationId={conversationId} />;
}
