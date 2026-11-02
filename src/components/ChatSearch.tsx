import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { supabase } from '../lib/supabase';
import { MESSAGE_COLS, type Message } from '../lib/chat';
import { Icon, type IconName } from '../lib/icons';
import { IconButton } from './Primitives';
import { timeLabel } from './MessageBubble';
import { space, radius, fontSize, control } from '../theme/tokens';
import { font } from '../theme/type';

type Filter = 'all' | 'image' | 'file' | 'voice';
type Phase = 'idle' | 'loading' | 'done' | 'error';

const CHIPS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'image', label: 'Photos' },
  { key: 'file', label: 'Files' },
  { key: 'voice', label: 'Voice' },
];

const KIND_LABEL: Record<string, string> = { image: 'Photo', file: 'File', voice: 'Voice message' };
const KIND_ICON: Record<string, IconName> = { image: 'media', file: 'doc', voice: 'mic' };

function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeLabel(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function ChatSearch({
  convId, userId, partnerName, onClose, onJump,
}: {
  convId: string;
  userId: string;
  partnerName: string;
  onClose: () => void;
  onJump: (m: Message) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [results, setResults] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const seq = useRef(0);
  const q = query.trim();

  useEffect(() => {
    if (filter === 'all' && q.length < 2) {
      seq.current++;
      setResults([]);
      setPhase('idle');
      return;
    }
    setPhase('loading');
    const stamp = ++seq.current;
    const t = setTimeout(async () => {
      const pat = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
      let req = supabase
        .from('messages')
        .select(MESSAGE_COLS)
        .eq('conversation_id', convId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(60);
      if (filter === 'all') req = req.ilike('body', pat);
      else {
        req = req.eq('kind', filter);
        if (q) req = req.ilike('body', pat);
      }
      const { data, error } = await req;
      if (stamp !== seq.current) return;
      if (error) {
        setPhase('error');
        return;
      }
      setResults((data ?? []) as Message[]);
      setPhase('done');
    }, 250);
    return () => clearTimeout(t);
  }, [q, filter, convId]);

  function snippet(body: string) {
    const i = q ? body.toLowerCase().indexOf(q.toLowerCase()) : -1;
    const base = { color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular };
    if (i < 0) return <Text numberOfLines={2} style={[base, { flex: 1 }]}>{body}</Text>;
    const from = i > 40 ? i - 30 : 0;
    return (
      <Text numberOfLines={2} style={[base, { flex: 1 }]}>
        {(from > 0 ? '…' : '') + body.slice(from, i)}
        <Text style={{ backgroundColor: c.accent + '55', color: c.text, fontFamily: font.semibold }}>{body.slice(i, i + q.length)}</Text>
        {body.slice(i + q.length)}
      </Text>
    );
  }

  const hint =
    phase === 'idle' ? (filter === 'all' ? 'Type at least two letters to search.' : '')
    : phase === 'error' ? "Couldn't search. Check your connection and try again."
    : phase === 'done' && results.length === 0 ? 'No messages found.'
    : '';

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 20, backgroundColor: c.surface }}>
      <View style={{ paddingTop: insets.top + space[2], paddingBottom: space[2], paddingHorizontal: space[2], backgroundColor: c.appbar, borderBottomWidth: 1, borderBottomColor: c.divider }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton icon="arrowLeft" label="Close search" onPress={onClose} />
          <TextInput
            autoFocus
            accessibilityLabel="Search messages"
            placeholder={'Search with ' + partnerName}
            placeholderTextColor={c.textSecondary}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onKeyPress={(e: any) => {
              if (Platform.OS === 'web' && e.nativeEvent.key === 'Escape') onClose();
            }}
            style={{ flex: 1, height: control.md, color: c.text, fontFamily: font.regular, fontSize: fontSize.body }}
          />
          {!!query && <IconButton icon="close" label="Clear search" onPress={() => setQuery('')} />}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[3], paddingTop: space[1], gap: space[2] }}>
          {CHIPS.map((ch) => {
            const on = filter === ch.key;
            return (
              <Pressable
                key={ch.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(ch.key)}
                style={{ height: 32, paddingHorizontal: space[4], borderRadius: 16, justifyContent: 'center', backgroundColor: on ? c.primary : c.surfaceSubtle }}
              >
                <Text style={{ color: on ? c.onPrimary : c.textSecondary, fontSize: fontSize.label, fontFamily: font.medium }}>{ch.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {phase === 'loading' && (
        <View style={{ padding: space[6], alignItems: 'center' }}>
          <ActivityIndicator color={c.primary} />
        </View>
      )}
      {!!hint && (
        <View style={{ padding: space[8], alignItems: 'center' }}>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>{hint}</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(m) => m.client_id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + space[4] }}
        renderItem={({ item }) => {
          const label = KIND_LABEL[item.kind];
          const body = item.body ?? '';
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onJump(item)}
              style={({ pressed }) => ({ paddingVertical: space[3], paddingHorizontal: space[5], gap: 4, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: pressed ? c.hover : 'transparent' })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: c.text, fontSize: 15, fontFamily: font.semibold }}>{item.sender_id === userId ? 'You' : partnerName}</Text>
                <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{when(item.created_at)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {!!label && <Icon name={KIND_ICON[item.kind]} size={16} color={c.textSecondary} />}
                {label && !body ? (
                  <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{label}</Text>
                ) : (
                  snippet(body)
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
