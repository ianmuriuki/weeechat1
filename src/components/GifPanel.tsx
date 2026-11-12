import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../hooks/useTheme';
import { giphyFetch, giphyReady, type GifItem, type GifPick } from '../lib/giphy';
import { space, fontSize, radius } from '../theme/tokens';
import { font } from '../theme/type';

export function GifPanel({ kind, onPick }: { kind: 'gif' | 'sticker'; onPick: (g: GifPick) => void }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<GifItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [w, setW] = useState(0);
  const req = useRef(0);
  const busy = useRef(false);

  const load = useCallback(
    async (query: string, offset: number) => {
      const id = ++req.current;
      busy.current = true;
      if (offset === 0) setLoading(true);
      try {
        const r = await giphyFetch(kind, query, offset);
        if (id !== req.current) return;
        setItems((prev) => (offset ? [...prev, ...r.items] : r.items));
        setNext(r.next);
        setError('');
      } catch (e) {
        if (id !== req.current) return;
        setError(e instanceof Error && e.message === 'not-configured' ? 'GIF search is not set up in this app yet.' : "Couldn't load. Check your connection.");
      } finally {
        if (id === req.current) {
          setLoading(false);
          busy.current = false;
        }
      }
    },
    [kind],
  );

  useEffect(() => {
    if (!giphyReady) {
      setLoading(false);
      setError('GIF search is not set up in this app yet.');
      return;
    }
    const t = setTimeout(() => void load(q.trim(), 0), q.trim() ? 400 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const cols = 3;
  const cell = Math.floor((w - space[2] * 2) / cols);

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 300, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider }}>
      <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3] }}>
        <TextInput
          accessibilityLabel={kind === 'sticker' ? 'Search stickers' : 'Search GIFs'}
          placeholder={kind === 'sticker' ? 'Search stickers' : 'Search GIFs'}
          placeholderTextColor={c.textSecondary}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          style={{ flex: 1, height: 36, paddingHorizontal: space[3], borderRadius: radius.md, backgroundColor: c.surfaceSubtle, color: c.text, fontSize: fontSize.label, fontFamily: font.regular }}
        />
        <Text style={{ color: c.textSecondary, fontSize: 10, fontFamily: font.medium }}>Powered by GIPHY</Text>
      </View>
      {loading && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : error && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6], gap: space[3] }}>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>{error}</Text>
          {giphyReady && (
            <Pressable accessibilityRole="button" onPress={() => void load(q.trim(), 0)} style={{ minHeight: 40, paddingHorizontal: space[5], borderRadius: radius.full, borderWidth: 1, borderColor: c.divider, justifyContent: 'center' }}>
              <Text style={{ color: c.primary, fontSize: fontSize.label, fontFamily: font.semibold }}>Try again</Text>
            </Pressable>
          )}
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6] }}>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>Nothing found. Try another word.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={cols}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{ paddingHorizontal: space[2], paddingBottom: space[2] }}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (next != null && !busy.current) void load(q.trim(), next);
          }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={(kind === 'sticker' ? 'Send sticker ' : 'Send GIF ') + item.title}
              onPress={() => onPick({ kind, url: item.url, w: item.w, h: item.h })}
              style={{ width: cell, height: cell, padding: 2 }}
            >
              <View style={{ flex: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: c.surfaceSubtle }}>
                <Image source={{ uri: item.thumb }} style={{ width: '100%', height: '100%' }} contentFit={kind === 'sticker' ? 'contain' : 'cover'} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
