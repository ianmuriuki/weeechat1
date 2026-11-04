import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CLEAR_PREFIX = 'weeez:conversation-clear:';

export async function getConversationClearedAt(conversationId: string) {
  return AsyncStorage.getItem(CLEAR_PREFIX + conversationId);
}

export async function clearConversationOnDevice(conversationId: string) {
  const clearedAt = new Date().toISOString();
  await AsyncStorage.setItem(CLEAR_PREFIX + conversationId, clearedAt);
  return clearedAt;
}

export async function clearConversationForEveryone(conversationId: string) {
  const { error } = await supabase.rpc('clear_conversation_for_everyone', { p_conversation: conversationId });
  if (error) throw error;
}

export async function blockUser(userId: string) {
  const { error } = await supabase.rpc('block_user', { p_user: userId });
  if (error) throw error;
}

export async function removeFriend(userId: string) {
  const { error } = await supabase.rpc('remove_friend', { p_user: userId });
  if (error) throw error;
}
