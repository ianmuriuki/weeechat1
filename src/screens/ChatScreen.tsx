import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator, Animated, AppState, FlatList, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useTheme } from '../hooks/useTheme';
import { supabase } from '../lib/supabase';
import * as Clipboard from 'expo-clipboard';
import { fetchMessages, fetchReactions, getConversationId, MESSAGE_COLS, type Message, type Profile, type Reaction } from '../lib/chat';
import { fetchMedia, getSignedUrl, pickDocument, pickFromCamera, pickFromGallery, uploadMedia, type MediaRow, type Picked } from '../lib/media';
import { useUnread } from '../lib/unread';
import { useInbox } from '../lib/inbox';
import { useCall } from '../lib/call';
import { clearNotifications } from '../lib/push';
import { enqueueText, flushOutbox, onOutbox, queuedFor, queuedToMessage } from '../lib/outbox';
import { readCache, writeCache } from '../lib/cache';
import { Icon } from '../lib/icons';
import { WeeChatButton } from '../components/weee/WeeChatButton';
import { Avatar, IconButton } from '../components/Primitives';
import { MessageBubble, timeLabel } from '../components/MessageBubble';
import { CallLogRow } from '../components/CallLogRow';
import { AttachmentSheet, type AttachSource } from '../components/AttachmentSheet';
import { MediaViewer } from '../components/MediaViewer';
import { SendPreview } from '../components/SendPreview';
import { TypingDots } from '../components/TypingDots';
import { ChatWallpaper } from '../components/ChatWallpaper';
import { MessageMenu } from '../components/MessageMenu';
import { EmojiPanel } from '../components/EmojiPanel';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { ChatSearch } from '../components/ChatSearch';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { SwipeToReply } from '../components/SwipeToReply';
import { firstLink, hrefFor } from '../lib/links';
import { space, radius, fontSize, control, motion } from '../theme/tokens';
import { font } from '../theme/type';

const lift: any = Platform.OS === 'web' ? { boxShadow: '0 1px 6px rgba(17,27,33,0.18)' } : { elevation: 3 };

function uuid(): string {
  const g: any = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function lastSeenLabel(iso: string | null) {
  if (!iso) return '';
  const same = new Date(iso).toDateString() === new Date().toDateString();
  return same ? 'last seen today at ' + timeLabel(iso) : 'last seen ' + dayLabel(iso).toLowerCase() + ' at ' + timeLabel(iso);
}

export default function ChatScreen({ userId, conversationId, initialAction }: { userId: string; conversationId?: string; initialAction?: 'audio' | 'video' | 'search' }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width > 820;
  const padH = wide ? Math.max(20, Math.min(88, width * 0.06)) : 12;

  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRow>>({});
  const [unreadFrom, setUnreadFrom] = useState<{ id: string; count: number } | null>(null);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [pendingPicks, setPendingPicks] = useState<Picked[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [single, setSingle] = useState<{ media: MediaRow; note: string } | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [info, setInfo] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const kb = useKeyboardHeight();
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [forcedSel, setForcedSel] = useState<{ start: number; end: number } | null>(null);
  const selRef = useRef({ start: 0, end: 0 });
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [away, setAway] = useState(false);
  const [awayAnchor, setAwayAnchor] = useState<string | null>(null);
  const [listH, setListH] = useState(600);
  const fabAnim = useRef(new Animated.Value(0)).current;

  const convRef = useRef<string | null>(null);
  const memberIdsRef = useRef<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribed = useRef(false);
  const lastTypingSent = useRef(0);
  const typingOff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typingClear = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requested = useRef(new Set<string>());

  const { setChatFocused, readOpen, sendTyping: inboxTyping } = useUnread();
  const { setActive, sendTyping: listTyping } = useInbox();
  const call = useCall();
  const [focused, setFocused] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const initialActionRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!convId || !initialAction || initialActionRef.current === initialAction) return;
    initialActionRef.current = initialAction;
    if (initialAction === 'search') setSearchOpen(true);
    else if (call.supported && convId) void call.start(initialAction, convId);
    else setError('Calls are not available in this app. Use the web app, or a development build.');
  }, [call, convId, initialAction]);

  useEffect(() => {
    Animated.timing(fabAnim, { toValue: away ? 1 : 0, duration: motion.fast, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [away, fabAnim]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const me = profiles.find((p) => p.id === userId);
  const partner = profiles.find((p) => p.id !== userId);
  const partnerName = partner?.display_name || 'Chat';

  const upsert = useCallback((m: Message) => {
    setMessages((prev) => {
      const i = prev.findIndex((x) => x.client_id === m.client_id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = { ...next[i], ...m, pending: m.pending ?? false, failed: m.failed ?? false };
        return next;
      }
      return [m, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at));
    });
  }, []);

  // Messages can arrive while the app sleeps or the connection is down. Pull the latest when we are back.
  const syncLatest = useCallback(async () => {
    const id = convRef.current;
    if (!id) return;
    try {
      const latest = await fetchMessages(id);
      fetchReactions(id).then(setReactions).catch(() => {});
      setMessages((prev) => {
        const map = new Map(prev.map((x) => [x.client_id, x] as const));
        for (const m of latest) {
          const old = map.get(m.client_id);
          map.set(m.client_id, old ? { ...old, ...m, pending: false, failed: false } : m);
        }
        return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
    } catch {
      // The next wake up will try again.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setConvId(null);
    convRef.current = null;
    setMessages([]);
    setProfiles([]);
    (async () => {
      try {
        const id = conversationId ?? await getConversationId();
        if (cancelled) return;
        convRef.current = id;
        setConvId(id);
        // Open from the phone first, so the chat is there without a connection.
        const [cached, queued] = await Promise.all([
          readCache<{ messages: Message[]; profiles: Profile[] }>('chat.' + id),
          queuedFor(userId, id),
        ]);
        if (cancelled) return;
        const waiting = queued.map(queuedToMessage);
        const combine = (base: Message[], prev: Message[]) => {
          const map = new Map(base.map((x) => [x.client_id, x] as const));
          for (const x of [...waiting, ...prev]) {
            if ((x.pending || x.failed || x.id.startsWith('local-')) && !map.has(x.client_id)) map.set(x.client_id, x);
          }
          return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
        };
        if (cached) {
          memberIdsRef.current = cached.profiles.map((p) => p.id);
          setMessages((prev) => combine(cached.messages, prev));
          setProfiles(cached.profiles);
          setLoading(false);
        } else if (waiting.length) {
          setMessages((prev) => combine([], prev));
        }
        try {
          const [msgs, membersResult, reacts] = await Promise.all([
            fetchMessages(id),
            supabase.from('conversation_members').select('user_id').eq('conversation_id', id),
            fetchReactions(id),
          ]);
          if (membersResult.error) throw membersResult.error;
          const memberIds = [...new Set([userId, ...(membersResult.data ?? []).map((member) => member.user_id)])];
          memberIdsRef.current = memberIds;
          const { data: profs, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username, display_name, status_text, avatar_path, last_seen_at')
            .in('id', memberIds);
          if (profilesError) throw profilesError;
          if (cancelled) return;
          setMessages((prev) => combine(msgs, prev));
          setProfiles((profs ?? []) as Profile[]);
          setReactions(reacts);
        } catch (e) {
          // Offline with a saved copy: stay open on it. The connection will catch up by itself.
          if (!cached) throw e;
        }

        // An earlier visit can still be closing its connection. Wait for it, or listeners cannot be added.
        const stale = supabase.getChannels().find((ch) => ch.topic === 'realtime:room:' + id);
        if (stale) await supabase.removeChannel(stale);
        if (cancelled) return;
        const channel = supabase
          .channel('room:' + id, { config: { presence: { key: userId }, broadcast: { self: false } } })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + id }, (payload) => {
            const m = payload.new as Message;
            if (!m || !m.id) return;
            upsert(m);
            if (payload.eventType === 'INSERT' && m.sender_id !== userId) readOpen();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<Reaction>;
            if (!row || !row.message_id || !row.user_id) return;
            setReactions((prev) => {
              const rest = prev.filter((x) => !(x.message_id === row.message_id && x.user_id === row.user_id));
              return payload.eventType === 'DELETE' || !row.emoji ? rest : [...rest, row as Reaction];
            });
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
            const p = payload.new as Profile;
            if (!p || !p.id) return;
            setProfiles((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
          })
          .on('presence', { event: 'sync' }, () => {
            const keys = Object.keys(channelRef.current?.presenceState() ?? {});
            const online = keys.some((k) => k !== userId);
            setPartnerOnline(online);
            if (!online && memberIdsRef.current.length) {
              supabase
                .from('profiles')
                .select('id, username, display_name, status_text, avatar_path, last_seen_at')
                .in('id', memberIdsRef.current)
                .then(({ data }) => {
                  if (data && !cancelled) setProfiles(data as Profile[]);
                });
            }
          })
          .on('broadcast', { event: 'typing' }, ({ payload }: { payload: any }) => {
            if (!payload || payload.userId === userId) return;
            setPartnerTyping(!!payload.typing);
            clearTimeout(typingClear.current);
            if (payload.typing) typingClear.current = setTimeout(() => setPartnerTyping(false), 4000);
          })
          .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              subscribed.current = true;
              syncLatest();
              await channel.track({ at: Date.now() });
            }
          });
        channelRef.current = channel;
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();

    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId).then(() => {});
      } else {
        syncLatest();
      }
    });

    return () => {
      cancelled = true;
      appSub.remove();
      clearTimeout(typingOff.current);
      clearTimeout(typingClear.current);
      subscribed.current = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId).then(() => {});
    };
  }, [userId, conversationId, upsert, syncLatest, readOpen]);

  // Keep a copy of the latest messages on the phone.
  useEffect(() => {
    if (!convId || loading) return;
    const t = setTimeout(() => {
      const keep = messages.filter((m) => !m.pending && !m.failed && !m.id.startsWith('local-') && !m.id.startsWith('call-')).slice(0, 100);
      if (keep.length || profiles.length) writeCache('chat.' + convId, { messages: keep, profiles });
    }, 800);
    return () => clearTimeout(t);
  }, [messages, profiles, convId, loading]);

  // Results of messages that were waiting to be sent.
  useEffect(
    () =>
      onOutbox((e) => {
        if (e.conversationId !== convRef.current) return;
        if (e.type === 'failed') markFailed(e.clientId);
        else if (e.message) upsert(e.message);
        else syncLatest();
      }),
    [upsert, syncLatest],
  );

  // Load the media rows that messages point to.
  useEffect(() => {
    const ids = messages.map((m) => m.media_id).filter((x): x is string => !!x && !requested.current.has(x));
    if (!ids.length) return;
    ids.forEach((i) => requested.current.add(i));
    fetchMedia(ids)
      .then((rows) =>
        setMediaMap((prev) => {
          const next = { ...prev };
          rows.forEach((r) => (next[r.id] = r));
          return next;
        }),
      )
      .catch(() => ids.forEach((i) => requested.current.delete(i)));
  }, [messages]);

  useEffect(() => {
    if (loading) return;
    if (focused) {
      const unread = messagesRef.current.filter((m) => m.sender_id !== userId && !m.read_at && !m.deleted_at);
      setUnreadFrom(unread.length ? { id: unread[unread.length - 1].client_id, count: unread.length } : null);
      setChatFocused(true, convId);
      setActive(convId);
    } else {
      setChatFocused(false);
      setActive(null);
      setUnreadFrom(null);
    }
  }, [focused, loading, userId, convId, setChatFocused, setActive]);

  // If this screen unmounts (desktop page switch), the inbox listener must stop treating the chat as open.
  useEffect(() => () => {
    setChatFocused(false);
    setActive(null);
  }, [setChatFocused, setActive]);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(''), 2000);
    return () => clearTimeout(t);
  }, [info]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!call.notice) return;
    setError(call.notice);
    call.clearNotice();
  }, [call.notice, call.clearNotice]);

  // A message notification leaves the tray as soon as the chat is open, including ones that arrive while it is open.
  useEffect(() => {
    if (focused && convId) clearNotifications(['message'], convId);
  }, [focused, convId, messages]);

  function sendTyping(typing: boolean) {
    inboxTyping(typing);
    if (convRef.current) listTyping(convRef.current, memberIdsRef.current.filter((id) => id !== userId), typing);
    const ch = channelRef.current;
    if (!ch || !subscribed.current) return;
    ch.send({ type: 'broadcast', event: 'typing', payload: { userId, typing } });
  }

  function onChangeText(t: string) {
    setText(t);
    if (editing) return;
    const now = Date.now();
    if (t.length && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      sendTyping(true);
    }
    clearTimeout(typingOff.current);
    typingOff.current = setTimeout(() => sendTyping(false), 2500);
  }

  function markFailed(client_id: string) {
    setMessages((prev) => prev.map((m) => (m.client_id === client_id ? { ...m, pending: false, failed: true } : m)));
    setError("Couldn't send. Tap the red mark to try again.");
  }

  async function send(existing?: Message) {
    const body = (existing?.body ?? text).trim();
    if (!body || !convId) return;
    const client_id = existing?.client_id ?? uuid();
    const reply_to = existing?.reply_to ?? replyTo?.id ?? null;
    const optimistic: Message = {
      id: 'local-' + client_id,
      conversation_id: convId,
      sender_id: userId,
      client_id,
      kind: 'text',
      body,
      media_id: null,
      reply_to,
      max_views: null,
      views_used: 0,
      created_at: existing?.created_at ?? new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      deleted_at: null,
      pending: true,
    };
    setText('');
    setReplyTo(null);
    setError('');
    clearTimeout(typingOff.current);
    sendTyping(false);
    upsert(optimistic);
    scrollToBottom();
    // Saved on the phone first. It is sent now, or as soon as there is a connection.
    await enqueueText(userId, { client_id, conversation_id: convId, sender_id: userId, body, reply_to, created_at: optimistic.created_at });
    void flushOutbox(userId);
  }

  async function sendPicked(picked: Picked, existing?: Message, opts?: { caption: string; twice: boolean }) {
    if (!convId) return;
    const client_id = existing?.client_id ?? uuid();
    const mediaId = existing?.local?.mediaId ?? uuid();
    const kind = picked.kind === 'image' ? 'image' : picked.kind === 'audio' ? 'voice' : 'file';
    const caption = (existing ? (existing.body ?? '') : (opts?.caption ?? '')).trim();
    const maxViews = existing ? existing.max_views : (opts?.twice && kind === 'image' ? 2 : null);
    setError('');
    upsert({
      id: 'local-' + client_id,
      conversation_id: convId,
      sender_id: userId,
      client_id,
      kind,
      body: caption || null,
      media_id: mediaId,
      reply_to: null,
      max_views: maxViews,
      views_used: 0,
      created_at: existing?.created_at ?? new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      deleted_at: null,
      pending: true,
      local: { picked, mediaId },
    });
    scrollToBottom();
    try {
      const row = await uploadMedia({ conversationId: convId, userId, mediaId, picked });
      requested.current.add(row.id);
      setMediaMap((prev) => ({ ...prev, [row.id]: row }));
      const { data, error: err } = await supabase
        .from('messages')
        .upsert(
          { conversation_id: convId, sender_id: userId, client_id, kind, body: caption || null, media_id: mediaId, max_views: maxViews },
          { onConflict: 'sender_id,client_id', ignoreDuplicates: true },
        )
        .select(MESSAGE_COLS);
      if (err) throw err;
      if (data && data[0]) upsert({ ...(data[0] as Message), local: undefined });
    } catch (e: any) {
      markFailed(client_id);
      setError("Couldn't send. " + (e?.message ?? 'Unknown error'));
    }
  }

  async function attach(source: AttachSource) {
    setSheet(false);
    try {
      let picks: Picked[] = [];
      if (source === 'gallery') {
        picks = await pickFromGallery(() => setPreparing(true));
      } else if (source === 'camera') {
        const p = await pickFromCamera();
        picks = p ? [p] : [];
      } else {
        const p = await pickDocument();
        picks = p ? [p] : [];
      }
      if (picks.length) setPendingPicks(picks);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't attach that.");
    } finally {
      setPreparing(false);
    }
  }

  const reactionMap = useMemo(() => {
    const m = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const a = m.get(r.message_id);
      if (a) a.push(r);
      else m.set(r.message_id, [r]);
    }
    return m;
  }, [reactions]);

  function snippet(m: Message) {
    if (m.deleted_at) return 'This message was deleted';
    if (m.kind === 'image') return m.body ? 'Photo: ' + m.body : 'Photo';
    if (m.kind === 'file') return m.body ? 'File: ' + m.body : 'File';
    if (m.kind === 'voice') return 'Voice message';
    return m.body ?? '';
  }

  function reactionSummary(m: Message) {
    const list = reactionMap.get(m.id);
    if (!list || !list.length) return null;
    const counts = new Map<string, number>();
    for (const r of list) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
    const emojis = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
    return { emojis, total: list.length };
  }

  function quoteFor(m: Message) {
    if (!m.reply_to || m.deleted_at) return null;
    const parent = messages.find((x) => x.id === m.reply_to);
    return {
      name: !parent ? 'Message' : parent.sender_id === userId ? 'You' : partnerName,
      text: parent ? snippet(parent) : 'Original message not available',
      bar: parent && parent.sender_id === userId ? c.primary : c.attachmentDocument,
      onPress: () => {
        const i = timeline.findIndex((x) => x.id === m.reply_to);
        if (i >= 0) listRef.current?.scrollToIndex({ index: i, viewPosition: 0.5, animated: true });
      },
    };
  }

  async function jumpTo(target: Message) {
    setSearchOpen(false);
    if (!convId) return;
    if (!messagesRef.current.some((m) => m.client_id === target.client_id)) {
      const { data, error: err } = await supabase
        .from('messages')
        .select(MESSAGE_COLS)
        .eq('conversation_id', convId)
        .gte('created_at', target.created_at)
        .order('created_at', { ascending: false })
        .limit(500);
      if (err) {
        setError("Couldn't open that message.");
        return;
      }
      setMessages((prev) => {
        const map = new Map(prev.map((x) => [x.client_id, x] as const));
        for (const m of (data ?? []) as Message[]) if (!map.has(m.client_id)) map.set(m.client_id, m);
        return Array.from(map.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
    }
    setHighlightId(target.client_id);
    setTimeout(() => setHighlightId(null), 2000);
    setTimeout(() => {
      const i = timelineRef.current.findIndex((m) => m.client_id === target.client_id);
      if (i >= 0) listRef.current?.scrollToIndex({ index: i, viewPosition: 0.5, animated: true });
    }, 160);
  }

  function toggleEmoji() {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  }

  function insertEmoji(e: string) {
    const { start, end } = selRef.current;
    const a = Math.min(start, text.length);
    const b = Math.min(Math.max(end, a), text.length);
    const next = text.slice(0, a) + e + text.slice(b);
    if (next.length > 8000) return;
    onChangeText(next);
    const pos = a + e.length;
    selRef.current = { start: pos, end: pos };
    setForcedSel({ start: pos, end: pos });
  }

  function startReply(m: Message) {
    if (editing) {
      setEditing(null);
      setText('');
    }
    setReplyTo(m);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function startEdit(m: Message) {
    setReplyTo(null);
    setEditing(m);
    const body = m.body ?? '';
    setText(body);
    selRef.current = { start: body.length, end: body.length };
    setForcedSel({ start: body.length, end: body.length });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function cancelEdit() {
    setEditing(null);
    setText('');
  }

  async function saveEdit() {
    const msg = editing;
    if (!msg) return;
    const body = text.trim();
    if (msg.kind === 'text' && !body) return;
    if (body === (msg.body ?? '').trim()) {
      cancelEdit();
      return;
    }
    const stamp = new Date().toISOString();
    const next = body || null;
    cancelEdit();
    upsert({ ...msg, body: next, edited_at: stamp });
    const { error: err } = await supabase.from('messages').update({ body: next, edited_at: stamp }).eq('id', msg.id);
    if (err) {
      upsert({ ...msg, edited_at: msg.edited_at ?? null });
      setError("Couldn't save the edit. Try again.");
    }
  }

  function submit() {
    if (editing) saveEdit();
    else send();
  }

  function scrollToBottom() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }

  // Show the button after about a screen of scrolling, hide it again near the bottom.
  function onListScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    const next = away ? y > 120 : y > Math.max(400, listH);
    if (next === away) return;
    setAway(next);
    setAwayAnchor(next ? (messagesRef.current[0]?.created_at ?? null) : null);
  }

  async function copyLink(msg: Message) {
    const url = msg.body ? firstLink(msg.body) : null;
    if (!url) return;
    try {
      await Clipboard.setStringAsync(hrefFor(url));
      setInfo('Link copied');
    } catch {
      setError("Couldn't copy that.");
    }
  }

  async function openLink(url: string) {
    try {
      await Linking.openURL(hrefFor(url));
    } catch {
      setError("Couldn't open that link.");
    }
  }

  async function react(msg: Message, emoji: string) {
    if (!convId || msg.pending || msg.id.startsWith('local-')) return;
    const mineR = reactions.find((r) => r.message_id === msg.id && r.user_id === userId);
    const same = !!mineR && mineR.emoji === emoji;
    setReactions((prev) => {
      const rest = prev.filter((r) => !(r.message_id === msg.id && r.user_id === userId));
      return same ? rest : [...rest, { message_id: msg.id, conversation_id: convId, user_id: userId, emoji }];
    });
    const res = same
      ? await supabase.from('reactions').delete().eq('message_id', msg.id).eq('user_id', userId)
      : mineR
        ? await supabase.from('reactions').update({ emoji }).eq('message_id', msg.id).eq('user_id', userId)
        : await supabase.from('reactions').insert({ message_id: msg.id, conversation_id: convId, user_id: userId, emoji });
    if (res.error) {
      setError("Couldn't react. Try again.");
      fetchReactions(convId).then(setReactions).catch(() => {});
    }
  }

  async function deleteMsg(msg: Message) {
    if (msg.sender_id !== userId || msg.id.startsWith('local-')) return;
    const stamp = new Date().toISOString();
    upsert({ ...msg, deleted_at: stamp, body: null });
    const { error: err } = await supabase.from('messages').update({ deleted_at: stamp, body: null }).eq('id', msg.id);
    if (err) {
      upsert(msg);
      setError("Couldn't delete. Try again.");
    }
  }

  async function copyMsg(msg: Message) {
    if (!msg.body) return;
    try {
      await Clipboard.setStringAsync(msg.body);
      setInfo('Copied');
    } catch {
      setError("Couldn't copy that.");
    }
  }

  // Photos with a view limit stay out of the swipe gallery.
  const images = useMemo(
    () =>
      messages
        .filter((m) => m.kind === 'image' && !m.max_views && m.media_id && mediaMap[m.media_id])
        .map((m) => mediaMap[m.media_id as string])
        .reverse(),
    [messages, mediaMap],
  );

  async function openLimited(m: Message) {
    const media = m.media_id ? mediaMap[m.media_id] : undefined;
    if (!media) {
      setError("Couldn't open that photo.");
      return;
    }
    const { data, error: err } = await supabase.rpc('consume_view', { p_message: m.id });
    if (err) {
      setError(/no views left/i.test(err.message) ? 'No views left on that photo.' : "Couldn't open that photo.");
      return;
    }
    const left: number | null | undefined = (data as any)?.[0]?.views_left;
    if (left != null && m.max_views != null) upsert({ ...m, views_used: m.max_views - left });
    setSingle({ media, note: left == null ? 'Your photo' : left > 0 ? left + (left === 1 ? ' view left' : ' views left') : 'Last view' });
  }

  async function openMedia(m: Message) {
    if (m.pending || !m.media_id) return;
    if (m.kind === 'image' && m.max_views) {
      if (m.sender_id !== userId) await openLimited(m);
      return;
    }
    const row = mediaMap[m.media_id];
    if (!row) return;
    if (m.kind === 'image') {
      const i = images.findIndex((x) => x.id === row.id);
      if (i >= 0) setViewer(i);
      return;
    }
    try {
      await Linking.openURL(await getSignedUrl(row.storage_path));
    } catch {
      setError("Couldn't open that file.");
    }
  }

  const missed = useMemo(
    () => (awayAnchor ? messages.filter((m) => m.created_at > awayAnchor && m.sender_id !== userId && !m.deleted_at).length : 0),
    [messages, awayAnchor, userId],
  );

  // Finished calls sit in the timeline between the messages, like WhatsApp.
  const timeline = useMemo(() => {
    const logs: Message[] = call.history
      .filter((x) => x.conversation_id === convId && (x.status === 'ended' || x.status === 'declined' || x.status === 'missed'))
      .map((x) => {
        const secs = x.answered_at && x.ended_at ? Math.max(0, Math.round((new Date(x.ended_at).getTime() - new Date(x.answered_at).getTime()) / 1000)) : 0;
        return {
          id: 'call-' + x.id,
          conversation_id: x.conversation_id,
          sender_id: x.caller_id,
          client_id: 'call-' + x.id,
          kind: 'call',
          body: x.kind + '|' + x.status + '|' + secs,
          media_id: null,
          reply_to: null,
          max_views: null,
          views_used: 0,
          created_at: x.ended_at ?? x.created_at,
          delivered_at: null,
          read_at: null,
          deleted_at: null,
        };
      });
    return logs.length ? [...messages, ...logs].sort((a, b) => b.created_at.localeCompare(a.created_at)) : messages;
  }, [messages, call.history, convId]);
  const timelineRef = useRef<Message[]>([]);
  timelineRef.current = timeline;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.chatCanvas, justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const canSend = editing ? editing.kind !== 'text' || !!text.trim() : !!text.trim();
  const status = partnerTyping ? 'typing' : partnerOnline ? 'online' : lastSeenLabel(partner?.last_seen_at ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: c.chatCanvas, paddingBottom: kb }}>
      <ChatWallpaper />
      <View
        style={{
          height: 72 + insets.top,
          paddingTop: insets.top,
          paddingLeft: space[5],
          paddingRight: space[4],
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.appbar,
          borderBottomWidth: 1,
          borderBottomColor: c.divider,
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          {!wide && (
            <View style={{ marginLeft: -space[3], marginRight: -space[3] }}>
              <IconButton icon="arrowLeft" label="Back to chats" onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat' as never))} />
            </View>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={'Open chat info for ' + partnerName} disabled={!convId} onPress={() => router.push(('/chat/info?conversationId=' + convId) as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], opacity: convId ? 1 : 0.6 }}>
            <Avatar name={partnerName} diameter={44} color={c.avatarIann} path={partner?.avatar_path} />
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 15, fontFamily: font.semibold }}>{partnerName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                {partnerOnline && !partnerTyping && (
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent, marginRight: 4 }} />
                )}
                <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{status}</Text>
              </View>
            </View>
          </Pressable>
        </View>
        <IconButton icon="search" label="Search messages" onPress={() => setSearchOpen(true)} />
        <IconButton
          icon="video"
          label="Start video call"
          disabled={call.phase !== 'idle'}
          onPress={() => (call.supported && convId ? call.start('video', convId) : setError('Calls are not available in this app. Use the web app, or a development build.'))}
        />
        <IconButton
          icon="phone"
          label="Start voice call"
          disabled={call.phase !== 'idle'}
          onPress={() => (call.supported && convId ? call.start('audio', convId) : setError('Calls are not available in this app. Use the web app, or a development build.'))}
        />
      </View>

      {!!error && (
        <View style={{ minHeight: 36, paddingHorizontal: space[3], paddingVertical: space[2], alignItems: 'center', justifyContent: 'center', backgroundColor: c.warningSurface }}>
          <Text style={{ color: c.warningText, fontSize: fontSize.meta, fontFamily: font.regular }}>{error}</Text>
        </View>
      )}

      {!!convId && <WeeChatButton conversationId={convId} top={72 + insets.top + space[2]} />}

      {!!info && (
        <View style={{ height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceSubtle }}>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{info}</Text>
        </View>
      )}

      {preparing && (
        <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], backgroundColor: c.surfaceSubtle }}>
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>Preparing photos</Text>
        </View>
      )}

      <View style={{ flex: 1 }} onLayout={(e) => setListH(e.nativeEvent.layout.height)}>
      <FlatList
        ref={listRef}
        inverted
        onScroll={onListScroll}
        scrollEventThrottle={16}
        data={timeline}
        keyExtractor={(m) => m.client_id}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={(info) => {
          listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: true }), 150);
        }}
        contentContainerStyle={{ paddingHorizontal: padH, paddingVertical: space[4] }}
        ListHeaderComponent={partnerTyping ? <TypingDots /> : undefined}
        ListFooterComponent={
          <View style={{ alignItems: 'center', marginBottom: space[3] }}>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 11,
                borderRadius: 7, backgroundColor: c.warningSurface,
              }}
            >
              <Icon name="lock" size={13} color={c.warningText} />
              <Text style={{ color: c.warningText, fontSize: 10, fontFamily: font.regular }}>
                Messages are protected in transit.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: c.textSecondary, fontFamily: font.regular, textAlign: 'center', padding: space[6], transform: [{ scaleY: -1 }] }}>
            Nothing here yet. Say hi.
          </Text>
        }
        renderItem={({ item, index }) => {
          const older = timeline[index + 1];
          const mine = item.sender_id === userId;
          const newDay = !older || dayKey(older.created_at) !== dayKey(item.created_at);
          const firstOfGroup = newDay || older.sender_id !== item.sender_id;
          const showUnread = unreadFrom?.id === item.client_id;
          return (
            <View style={{ marginHorizontal: -padH, paddingHorizontal: padH, backgroundColor: highlightId === item.client_id ? c.accent + '2e' : 'transparent' }}>
              {newDay && (
                <View
                  style={{
                    alignSelf: 'center', marginTop: space[3], marginBottom: space[3], paddingVertical: 6, paddingHorizontal: space[3],
                    borderRadius: radius.sm, backgroundColor: c.surface,
                  }}
                >
                  <Text style={{ color: c.textSecondary, fontSize: fontSize.caption, fontFamily: font.medium }}>{dayLabel(item.created_at)}</Text>
                </View>
              )}
              {showUnread && (
                <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[3], marginBottom: space[1] }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.primary, opacity: 0.45 }} />
                  <Text style={{ color: c.primary, fontSize: 10, fontFamily: font.medium, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {unreadFrom!.count + (unreadFrom!.count === 1 ? ' unread message' : ' unread messages')}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: c.primary, opacity: 0.45 }} />
                </View>
              )}
              {item.kind === 'call' ? (
                <CallLogRow message={item} userId={userId} />
              ) : (
              <SwipeToReply enabled={!item.pending && !item.deleted_at && !item.id.startsWith('local-')} onReply={() => startReply(item)}>
                <MessageBubble
                  message={item}
                  media={item.media_id ? mediaMap[item.media_id] : undefined}
                  mine={mine}
                  firstOfGroup={firstOfGroup || showUnread}
                  wide={wide}
                  onRetry={() => (item.local ? sendPicked(item.local.picked, item) : send(item))}
                  onOpen={() => openMedia(item)}
                  onLink={openLink}
                  onLongPress={() => {
                    if (!item.deleted_at) setMenuMsg(item);
                  }}
                  quote={quoteFor(item)}
                  reactions={reactionSummary(item)}
                  senderName={item.sender_id === userId ? (me?.display_name || 'You') : partnerName}
                  senderAvatar={item.sender_id === userId ? me?.avatar_path : partner?.avatar_path}
                />
              </SwipeToReply>
              )}
            </View>
          );
        }}
      />
        <Animated.View pointerEvents={away ? 'auto' : 'none'} style={{ position: 'absolute', right: space[4] - 4, bottom: space[4] - 4, opacity: fabAnim }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={missed > 0 ? 'Scroll to latest, ' + missed + (missed === 1 ? ' new message' : ' new messages') : 'Scroll to latest message'}
            onPress={scrollToBottom}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={[{ width: 40, height: 40, borderRadius: radius.full, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, lift]}>
              <Icon name="chevronDown" color={c.textSecondary} />
            </View>
            {missed > 0 && (
              <View style={{ position: 'absolute', top: 0, left: 0, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.onPrimary, fontSize: fontSize.caption, fontFamily: font.semibold }}>{missed > 99 ? '99+' : missed}</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </View>

      {replyTo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: space[3], paddingRight: space[1], paddingTop: space[2], backgroundColor: c.surfaceSubtle }}>
          <View style={{ flex: 1, flexDirection: 'row', borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.overlaySoft }}>
            <View style={{ width: 4, backgroundColor: replyTo.sender_id === userId ? c.primary : c.attachmentDocument }} />
            <View style={{ flex: 1, paddingVertical: 6, paddingHorizontal: 10 }}>
              <Text numberOfLines={1} style={{ color: replyTo.sender_id === userId ? c.primary : c.attachmentDocument, fontSize: 12, fontFamily: font.semibold }}>
                {replyTo.sender_id === userId ? 'You' : partnerName}
              </Text>
              <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 13, fontFamily: font.regular }}>{snippet(replyTo)}</Text>
            </View>
          </View>
          <IconButton icon="close" label="Cancel reply" onPress={() => setReplyTo(null)} />
        </View>
      )}

      {editing && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: space[3], paddingRight: space[1], paddingTop: space[2], backgroundColor: c.surfaceSubtle }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], borderRadius: radius.sm, backgroundColor: c.overlaySoft, paddingVertical: 6, paddingHorizontal: space[3] }}>
            <Icon name="edit" size={20} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.primary, fontSize: 12, fontFamily: font.semibold }}>Edit message</Text>
              <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: 13, fontFamily: font.regular }}>{snippet(editing)}</Text>
            </View>
          </View>
          <IconButton icon="close" label="Cancel edit" onPress={cancelEdit} />
        </View>
      )}

      <View
        style={{
          minHeight: 72,
          paddingVertical: space[2] + 2,
          paddingBottom: space[2] + 2 + (kb > 0 ? 0 : insets.bottom),
          paddingHorizontal: space[2],
          flexDirection: 'row',
          alignItems: 'flex-end',
          backgroundColor: c.surfaceSubtle,
        }}
      >
        <IconButton icon="emoji" label={emojiOpen ? 'Show keyboard' : 'Choose emoji'} onPress={toggleEmoji} />
        <TextInput
          ref={inputRef}
          onFocus={() => setEmojiOpen(false)}
          selection={forcedSel ?? undefined}
          onSelectionChange={(e) => {
            selRef.current = e.nativeEvent.selection;
            if (forcedSel) setForcedSel(null);
          }}
          accessibilityLabel={'Message ' + partnerName}
          placeholder={'Message ' + partnerName}
          placeholderTextColor={c.textSecondary}
          value={text}
          onChangeText={onChangeText}
          multiline
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          style={{
            flex: 1,
            minHeight: control.md,
            maxHeight: 120,
            paddingHorizontal: space[4],
            paddingTop: 13,
            paddingBottom: 13,
            borderRadius: radius.xl,
            borderWidth: 1,
            borderColor: c.divider,
            backgroundColor: c.surface,
            color: c.text,
            fontFamily: font.regular,
            fontSize: fontSize.label,
            lineHeight: 20,
          }}
        />
        {!editing && <IconButton icon="paperclip" label="Add attachment" onPress={() => setSheet(true)} />}
        {!canSend && !editing && <IconButton icon="camera" label="Take a photo" onPress={() => attach('camera')} />}
        {!canSend && !editing && <VoiceRecorder onRecorded={(p) => sendPicked(p)} onHint={setInfo} />}
        {canSend && <Pressable
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save edit' : 'Send message'}
          onPress={submit}
          style={({ pressed }) => ({
            width: control.md,
            height: control.md,
            borderRadius: radius.full,
            backgroundColor: c.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canSend ? (pressed ? 0.92 : 1) : 0.5,
          })}
        >
          <Icon name={editing ? 'check' : 'send'} color={c.onPrimary} />
        </Pressable>}
      </View>

      {searchOpen && convId && (
        <ChatSearch convId={convId} userId={userId} partnerName={partnerName} onClose={() => setSearchOpen(false)} onJump={jumpTo} />
      )}

      {emojiOpen && <EmojiPanel onPick={insertEmoji} />}

      <MessageMenu
        message={menuMsg}
        media={menuMsg?.media_id ? mediaMap[menuMsg.media_id] : undefined}
        mine={menuMsg?.sender_id === userId}
        myEmoji={menuMsg ? reactions.find((r) => r.message_id === menuMsg.id && r.user_id === userId)?.emoji : undefined}
        partnerName={partnerName}
        onClose={() => setMenuMsg(null)}
        onReact={(e) => {
          const m = menuMsg;
          setMenuMsg(null);
          if (m) react(m, e);
        }}
        onReply={() => {
          const m = menuMsg;
          setMenuMsg(null);
          if (m) startReply(m);
        }}
        onCopy={() => {
          const m = menuMsg;
          setMenuMsg(null);
          if (m) copyMsg(m);
        }}
        onCopyLink={() => {
          const m = menuMsg;
          setMenuMsg(null);
          if (m) copyLink(m);
        }}
        onEdit={() => {
          const m = menuMsg;
          setMenuMsg(null);
          if (m) startEdit(m);
        }}
        onDelete={() => {
          const m = menuMsg;
          setMenuMsg(null);
          if (m) deleteMsg(m);
        }}
      />
      <AttachmentSheet visible={sheet} onClose={() => setSheet(false)} onPick={attach} />
      {pendingPicks.length > 0 && (
        <SendPreview
          key={pendingPicks.map((p) => p.uri).join('|')}
          picks={pendingPicks}
          toName={partnerName}
          onCancel={() => setPendingPicks([])}
          onSend={(items) => {
            setPendingPicks([]);
            // One after another, so the photos land in the order they were picked.
            (async () => {
              for (const it of items) await sendPicked(it.picked, undefined, { caption: it.caption, twice: it.twice });
            })();
          }}
        />
      )}
      <MediaViewer items={images} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      <MediaViewer items={single ? [single.media] : []} index={single ? 0 : null} onIndex={() => {}} onClose={() => setSingle(null)} note={single?.note} />
    </View>
  );
}
