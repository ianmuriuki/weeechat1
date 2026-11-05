import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchConversationSummaries, type ConversationSummary } from './chat';
import { clearNotifications } from './push';

type Ctx = {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string;
  reload: () => void;
  typing: Record<string, boolean>;
  setActive: (conversationId: string | null) => void;
  sendTyping: (conversationId: string, recipients: string[], typing: boolean) => void;
};

const InboxContext = createContext<Ctx>({
  conversations: [],
  loading: true,
  error: '',
  reload: () => {},
  typing: {},
  setActive: () => {},
  sendTyping: () => {},
});

// One live view of every conversation the signed in user is in. The chat list, the desktop sidebar and the chat screen all read from here.
export function InboxProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typing, setTyping] = useState<Record<string, boolean>>({});
  const [active, setActiveState] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribed = useRef(false);
  const previous = useRef<Record<string, number>>({});
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await fetchConversationSummaries(userId);
      if (!alive.current) return;
      // A chat that had unread messages and is now read also leaves the notification tray.
      for (const row of next) {
        if ((previous.current[row.id] ?? 0) > 0 && row.unread === 0) void clearNotifications(['message'], row.id);
        previous.current[row.id] = row.unread;
      }
      setRows(next);
      setError('');
    } catch {
      if (alive.current) setError("Couldn't load chats. Try again.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [userId]);

  const reload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void load();
    }, 250);
  }, [load]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void load();

    (async () => {
      // An earlier visit can still be closing its connection. Wait for it, or listeners cannot be added.
      const stale = supabase.getChannels().find((ch) => ch.topic === 'realtime:weeez:inbox');
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;
      const channel = supabase
        .channel('weeez:inbox', { config: { broadcast: { self: false } } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => reload())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => reload())
        .on('broadcast', { event: 'typing' }, ({ payload }: { payload: any }) => {
          if (!payload || payload.from === userId || !payload.conversationId) return;
          if (!Array.isArray(payload.to) || !payload.to.includes(userId)) return;
          const id = payload.conversationId as string;
          clearTimeout(typingTimers.current[id]);
          setTyping((t) => ({ ...t, [id]: !!payload.typing }));
          if (payload.typing) typingTimers.current[id] = setTimeout(() => setTyping((t) => ({ ...t, [id]: false })), 4000);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            subscribed.current = true;
            void load();
          }
        });
      channelRef.current = channel;
    })();

    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load();
    });

    return () => {
      cancelled = true;
      alive.current = false;
      appSub.remove();
      clearTimeout(timer.current);
      Object.values(typingTimers.current).forEach(clearTimeout);
      subscribed.current = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [userId, load, reload]);

  const setActive = useCallback((id: string | null) => setActiveState(id), []);

  const sendTyping = useCallback(
    (conversationId: string, recipients: string[], isTyping: boolean) => {
      const ch = channelRef.current;
      if (!ch || !subscribed.current || !recipients.length) return;
      void ch.send({ type: 'broadcast', event: 'typing', payload: { from: userId, to: recipients, conversationId, typing: isTyping } });
    },
    [userId],
  );

  // The chat that is open on screen never shows an unread badge.
  const conversations = useMemo(() => (active ? rows.map((r) => (r.id === active ? { ...r, unread: 0 } : r)) : rows), [rows, active]);

  const value = useMemo(
    () => ({ conversations, loading, error, reload, typing, setActive, sendTyping }),
    [conversations, loading, error, reload, typing, setActive, sendTyping],
  );

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export const useInbox = () => useContext(InboxContext);
