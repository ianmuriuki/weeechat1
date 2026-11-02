import { supabase } from './supabase';
import type { Picked } from './media';

export const MESSAGE_COLS =
  'id, conversation_id, sender_id, client_id, kind, body, media_id, reply_to, max_views, views_used, created_at, delivered_at, read_at, deleted_at, edited_at';

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  kind: string;
  body: string | null;
  media_id: string | null;
  reply_to: string | null;
  max_views: number | null;
  views_used: number;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  deleted_at: string | null;
  edited_at?: string | null;
  pending?: boolean;
  failed?: boolean;
  local?: { picked: Picked; mediaId: string };
};

export async function getConversationId(): Promise<string> {
  const { data, error } = await supabase.from('conversation_members').select('conversation_id').limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No conversation found for this account.');
  return data.conversation_id;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export type Profile = {
  id: string;
  display_name: string;
  status_text: string;
  avatar_path: string | null;
  last_seen_at: string | null;
};

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('id, display_name, status_text, avatar_path, last_seen_at');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function markRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_read', { p_conversation: conversationId });
  if (error) console.warn('mark_read failed', error.message);
}

export async function markDelivered(conversationId: string) {
  const { error } = await supabase.rpc('mark_delivered', { p_conversation: conversationId });
  if (error) console.warn('mark_delivered failed', error.message);
}

export type Reaction = { message_id: string; conversation_id: string; user_id: string; emoji: string };

export async function fetchReactions(conversationId: string): Promise<Reaction[]> {
  const { data, error } = await supabase
    .from('reactions')
    .select('message_id, conversation_id, user_id, emoji')
    .eq('conversation_id', conversationId);
  if (error) throw error;
  return (data ?? []) as Reaction[];
}
