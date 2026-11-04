import { supabase } from './supabase';

export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed';
export type CallRow = {
  id: string;
  conversation_id: string;
  caller_id: string;
  kind: CallKind;
  status: CallStatus;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  peer?: CallPeer;
};

export type CallPeer = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
};

// Asks the backend for a LiveKit join token. The backend checks you belong to the conversation.
export async function fetchCallToken(conversationId: string): Promise<{ token: string; url: string }> {
  const { data, error } = await supabase.functions.invoke('livekit-token', { body: { conversationId } });
  if (error || !data?.token || !data?.url) throw new Error(error?.message ?? 'Could not get a call token');
  return { token: data.token as string, url: data.url as string };
}

export async function startCall(conversationId: string, kind: CallKind): Promise<string> {
  const { data, error } = await supabase.rpc('start_call', { p_conversation: conversationId, p_kind: kind });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function answerCall(callId: string) {
  const { error } = await supabase.rpc('answer_call', { p_call: callId });
  if (error) throw new Error(error.message);
}

export async function endCall(callId: string) {
  const { error } = await supabase.rpc('end_call', { p_call: callId });
  if (error) throw new Error(error.message);
}
