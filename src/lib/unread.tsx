import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { fetchProfiles, getConversationId, markDelivered, markRead, MESSAGE_COLS, type Message, type Profile } from './chat';
import { setChatOpen } from './push';

type Ctx = {
  unread: number;
  setChatFocused: (focused: boolean, conversationId?: string | null) => void;
  last: Message | null;
  partner: Profile | null;
  partnerTyping: boolean;
  partnerOnline: boolean;
  sendTyping: (typing: boolean) => void;
  resync: () => void;
  readOpen: () => void;
};

const UnreadContext = createContext<Ctx>({
  unread: 0,
  setChatFocused: () => {},
  last: null,
  partner: null,
  partnerTyping: false,
  partnerOnline: false,
  sendTyping: () => {},
  resync: () => {},
  readOpen: () => {},
});

export function UnreadProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [last, setLast] = useState<Message | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const focused = useRef(false);
  const convRef = useRef<string | null>(null);
  const openConv = useRef<string | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const subscribed = useRef(false);
  const typingClear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const countUnread = useCallback(async () => {
    const id = convRef.current;
    if (!id) return;
    if (focused.current && AppState.currentState === 'active') return;
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', id)
      .neq('sender_id', userId)
      .is('read_at', null)
      .is('deleted_at', null);
    if (!error) setUnread(count ?? 0);
  }, [userId]);

  const readIfVisible = useCallback(async () => {
    const id = openConv.current ?? convRef.current;
    if (!id || !focused.current || AppState.currentState !== 'active') return;
    await markRead(id);
    if (id === convRef.current) setUnread(0);
  }, []);

  const readOpen = useCallback(() => {
    void readIfVisible();
  }, [readIfVisible]);

  // Runs when the app connects, wakes up, or the list comes into view.
  const resync = useCallback(async () => {
    const id = convRef.current;
    if (!id) return;
    try {
      const [profs, lastRes] = await Promise.all([
        fetchProfiles(),
        supabase.from('messages').select(MESSAGE_COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setPartner(profs.find((p) => p.id !== userId) ?? null);
      setLast((lastRes.data as Message | null) ?? null);
      // This app is online, so anything that was waiting for us counts as delivered.
      await markDelivered(id);
      await readIfVisible();
      await countUnread();
    } catch {
      // The next wake up will try again.
    }
  }, [userId, countUnread, readIfVisible]);

  const setChatFocused = useCallback(
    (f: boolean, conversationId?: string | null) => {
      focused.current = f;
      openConv.current = f ? (conversationId ?? convRef.current) : null;
      setChatOpen(f);
      if (f) readIfVisible();
    },
    [readIfVisible],
  );

  const sendTyping = useCallback(
    (typing: boolean) => {
      const ch = chRef.current;
      if (!ch || !subscribed.current) return;
      ch.send({ type: 'broadcast', event: 'typing', payload: { userId, typing } });
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const id = await getConversationId();
        if (cancelled) return;
        convRef.current = id;

        const channel = supabase
          .channel('inbox:' + id, { config: { presence: { key: userId }, broadcast: { self: false } } })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + id }, (payload) => {
            if (payload.eventType === 'DELETE') {
              resync();
              return;
            }
            const m = payload.new as Message;
            if (!m || !m.id) return;
            setLast((prev) => {
              if (!prev || m.created_at > prev.created_at) return m;
              if (m.client_id === prev.client_id) return { ...prev, ...m };
              return prev;
            });
            if (payload.eventType !== 'INSERT' || m.sender_id === userId) return;
            setPartnerTyping(false);
            if (focused.current && openConv.current === id && AppState.currentState === 'active') {
              markRead(id);
              setUnread(0);
            } else {
              markDelivered(id);
              setUnread((n) => n + 1);
            }
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
            const p = payload.new as Profile;
            if (p && p.id && p.id !== userId) setPartner((prev) => ({ ...(prev ?? {}), ...p }) as Profile);
          })
          .on('broadcast', { event: 'typing' }, ({ payload }: { payload: any }) => {
            if (!payload || payload.userId === userId) return;
            setPartnerTyping(!!payload.typing);
            clearTimeout(typingClear.current);
            if (payload.typing) typingClear.current = setTimeout(() => setPartnerTyping(false), 4000);
          })
          .on('presence', { event: 'sync' }, () => {
            const keys = Object.keys(chRef.current?.presenceState() ?? {});
            setPartnerOnline(keys.some((k) => k !== userId));
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              subscribed.current = true;
              resync();
              await channel.track({ at: Date.now() });
            }
          });
        chRef.current = channel;
      } catch (e) {
      }
    })();

    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resync();
    });

    return () => {
      cancelled = true;
      appSub.remove();
      clearTimeout(typingClear.current);
      subscribed.current = false;
      if (chRef.current) supabase.removeChannel(chRef.current);
      chRef.current = null;
    };
  }, [userId, resync]);

  return (
    <UnreadContext.Provider value={{ unread, setChatFocused, last, partner, partnerTyping, partnerOnline, sendTyping, resync, readOpen }}>
      {children}
    </UnreadContext.Provider>
  );
}

export const useUnread = () => useContext(UnreadContext);
