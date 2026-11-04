import { supabase } from './supabase';
import type { Picked } from './media';
import { getConversationClearedAt } from './conversationActions';

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
  const clearedAt = await getConversationClearedAt(conversationId);
  return ((data ?? []) as Message[]).filter((message) => !clearedAt || message.created_at > clearedAt);
}

export type Profile = {
  id: string;
  username?: string;
  display_name: string;
  status_text: string;
  avatar_path: string | null;
  last_seen_at: string | null;
};

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('profiles').select('id, username, display_name, status_text, avatar_path, last_seen_at');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export type ConversationSummary = {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  avatar_path: string | null;
  other: Profile | null;
  last: Message | null;
  unread: number;
};

export async function fetchConversationSummaries(userId: string): Promise<ConversationSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId);
  if (membershipError) throw membershipError;
  const ids = (memberships ?? []).map((row) => row.conversation_id);
  if (!ids.length) return [];

  const [{ data: conversations, error: conversationError }, { data: members, error: memberError }, { data: messages, error: messageError }] = await Promise.all([
    supabase.from('conversations').select('id, kind, title, avatar_path, created_at').in('id', ids),
    supabase.from('conversation_members').select('conversation_id, user_id').in('conversation_id', ids).neq('user_id', userId),
    supabase.from('messages').select(MESSAGE_COLS).in('conversation_id', ids).order('created_at', { ascending: false }).limit(200),
  ]);
  if (conversationError) throw conversationError;
  if (memberError) throw memberError;
  if (messageError) throw messageError;

  const otherIds = [...new Set((members ?? []).map((row) => row.user_id))];
  const { data: profiles, error: profileError } = otherIds.length
    ? await supabase.from('profiles').select('id, username, display_name, status_text, avatar_path, last_seen_at').in('id', otherIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const clearedAtByConversation = new Map<string, string>();
  await Promise.all(ids.map(async (id) => {
    const clearedAt = await getConversationClearedAt(id);
    if (clearedAt) clearedAtByConversation.set(id, clearedAt);
  }));

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile as Profile]));
  const memberByConversation = new Map<string, string>();
  for (const member of members ?? []) memberByConversation.set(member.conversation_id, member.user_id);
  const latestByConversation = new Map<string, Message>();
  for (const message of (messages ?? []) as Message[]) {
    const clearedAt = clearedAtByConversation.get(message.conversation_id);
    if (clearedAt && message.created_at <= clearedAt) continue;
    if (!latestByConversation.has(message.conversation_id)) latestByConversation.set(message.conversation_id, message);
  }

  const unreadByConversation = new Map<string, number>();
  const unreadResult = await supabase
    .from('messages')
    .select('conversation_id, created_at')
    .in('conversation_id', ids)
    .neq('sender_id', userId)
    .is('read_at', null)
    .is('deleted_at', null);
  if (unreadResult.error) throw unreadResult.error;
  for (const message of unreadResult.data ?? []) {
    const clearedAt = clearedAtByConversation.get(message.conversation_id);
    if (clearedAt && message.created_at <= clearedAt) continue;
    unreadByConversation.set(message.conversation_id, (unreadByConversation.get(message.conversation_id) ?? 0) + 1);
  }

  return ((conversations ?? []) as Array<{ id: string; kind: 'direct' | 'group'; title: string | null; avatar_path: string | null; created_at: string }>)
    .map((conversation) => ({
      id: conversation.id,
      kind: conversation.kind,
      title: conversation.title,
      avatar_path: conversation.avatar_path,
      other: profileById.get(memberByConversation.get(conversation.id) ?? '') ?? null,
      last: latestByConversation.get(conversation.id) ?? null,
      unread: unreadByConversation.get(conversation.id) ?? 0,
    }))
    .sort((a, b) => (b.last?.created_at ?? b.id).localeCompare(a.last?.created_at ?? a.id));
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
