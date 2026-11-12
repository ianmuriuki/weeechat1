import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { MESSAGE_COLS, type Message } from './chat';

// Text messages are saved on the phone first and sent when there is a connection. They survive closing the app.
export type QueuedText = {
  client_id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to: string | null;
  created_at: string;
};

export type OutboxEvent =
  | { type: 'sent'; conversationId: string; clientId: string; message: Message | null }
  | { type: 'failed'; conversationId: string; clientId: string };

const key = (uid: string) => 'weeez.outbox.' + uid;
const listeners = new Set<(e: OutboxEvent) => void>();

export function onOutbox(listener: (e: OutboxEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(e: OutboxEvent) {
  listeners.forEach((l) => {
    try {
      l(e);
    } catch {}
  });
}

const stores = new Map<string, Promise<QueuedText[]>>();

function items(uid: string) {
  let p = stores.get(uid);
  if (!p) {
    p = AsyncStorage.getItem(key(uid))
      .then((raw) => (raw ? (JSON.parse(raw) as QueuedText[]) : []))
      .catch(() => [] as QueuedText[]);
    stores.set(uid, p);
  }
  return p;
}

function persist(uid: string, arr: QueuedText[]) {
  AsyncStorage.setItem(key(uid), JSON.stringify(arr)).catch(() => {});
}

export async function enqueueText(uid: string, q: QueuedText) {
  const arr = await items(uid);
  if (arr.some((x) => x.client_id === q.client_id)) return;
  arr.push(q);
  persist(uid, arr);
}

export async function queuedFor(uid: string, conversationId: string) {
  return (await items(uid)).filter((x) => x.conversation_id === conversationId);
}

export function queuedToMessage(q: QueuedText): Message {
  return {
    id: 'local-' + q.client_id,
    conversation_id: q.conversation_id,
    sender_id: q.sender_id,
    client_id: q.client_id,
    kind: 'text',
    body: q.body,
    media_id: null,
    reply_to: q.reply_to,
    max_views: null,
    views_used: 0,
    created_at: q.created_at,
    delivered_at: null,
    read_at: null,
    deleted_at: null,
    pending: true,
  };
}

async function run(uid: string): Promise<number> {
  const arr = await items(uid);
  let sent = 0;
  while (arr.length) {
    const q = arr[0];
    let res;
    try {
      res = await supabase
        .from('messages')
        .upsert(
          { conversation_id: q.conversation_id, sender_id: uid, client_id: q.client_id, kind: 'text', body: q.body, reply_to: q.reply_to },
          { onConflict: 'sender_id,client_id', ignoreDuplicates: true },
        )
        .select(MESSAGE_COLS);
    } catch {
      return sent;
    }
    if (res.error) {
      const code = (res.error as { code?: string }).code;
      // No code means the request never reached the server, so keep it and try again later.
      // An expired sign in (PGRST3xx) also heals itself, so it stays queued too.
      if (!code || code.startsWith('PGRST3')) return sent;
      arr.shift();
      persist(uid, arr);
      emit({ type: 'failed', conversationId: q.conversation_id, clientId: q.client_id });
      continue;
    }
    arr.shift();
    persist(uid, arr);
    sent += 1;
    emit({ type: 'sent', conversationId: q.conversation_id, clientId: q.client_id, message: (res.data?.[0] as Message | undefined) ?? null });
  }
  return sent;
}

let flushing: Promise<number> | null = null;
let again = false;

// Sends everything waiting, oldest first. Safe to call often: only one run happens at a time.
export function flushOutbox(uid: string): Promise<number> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    let total = 0;
    do {
      again = false;
      total += await run(uid);
    } while (again);
    return total;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}
