import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useSession } from './session';

export type WeeLink = {
  link_id: string;
  partner_id: string;
  partner_name: string | null;
  partner_avatar: string | null;
  conversation_id: string;
  status: 'pending_partner' | 'pending_admin' | 'active';
  requested_by: string;
  active_since: string | null;
};

// allowed: the admin switched Wee on for this account. requests: Wee requests waiting for the admin (admin only).
// version goes up whenever a link or the account switches change, so open screens reload.
type Ctx = { allowed: boolean; requests: number; version: number; reload: () => Promise<void> };
const WeeLinkContext = createContext<Ctx>({ allowed: false, requests: 0, version: 0, reload: async () => {} });

export function useWeeLink() {
  return useContext(WeeLinkContext);
}

export function WeeLinkProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { profile } = useSession();
  const isAdmin = !!profile?.is_admin;
  const [allowed, setAllowed] = useState(false);
  const [requests, setRequests] = useState(0);
  const [version, setVersion] = useState(0);
  const adminRef = useRef(isAdmin);
  adminRef.current = isAdmin;

  const reload = useCallback(async () => {
    const a = await supabase.rpc('my_wee_allowed');
    if (!a.error) setAllowed(a.data === true);
    if (adminRef.current) {
      const pending = await supabase.rpc('list_wee_requests');
      const accounts = await supabase.rpc('list_pending');
      setRequests((pending.error ? 0 : ((pending.data as unknown[] | null) ?? []).length) + (accounts.error ? 0 : ((accounts.data as unknown[] | null) ?? []).length));
    } else {
      setRequests(0);
    }
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, userId, isAdmin]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void reload();
    });
    return () => sub.remove();
  }, [reload]);

  // One channel for link rows and account switches. Row security decides which rows this user may see.
  useEffect(() => {
    let alive = true;
    let ch: RealtimeChannel | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const kick = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 250);
    };
    (async () => {
      const name = 'weeez:wee-links';
      const stale = supabase.getChannels().find((x) => x.topic === 'realtime:' + name);
      if (stale) await supabase.removeChannel(stale);
      if (!alive) return;
      ch = supabase
        .channel(name)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'wee_links' }, kick)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'account_features' }, kick)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') kick();
        });
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [reload, userId]);

  const value = useMemo(() => ({ allowed, requests, version, reload }), [allowed, requests, version, reload]);
  return <WeeLinkContext.Provider value={value}>{children}</WeeLinkContext.Provider>;
}

// The signed in user's link or request for one chat.
export function useChatWee(conversationId: string | null | undefined) {
  const { version } = useWeeLink();
  const [link, setLink] = useState<WeeLink | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!conversationId) {
      setLink(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc('wee_link_for', { p_conversation: conversationId });
    if (!error) setLink(((data as WeeLink[] | null) ?? [])[0] ?? null);
    setLoading(false);
  }, [conversationId]);
  useEffect(() => {
    void load();
  }, [load, version]);
  return { link, loading, reload: load };
}
