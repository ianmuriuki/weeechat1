import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Linking, Platform, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { Icon, type IconName } from '../lib/icons';
import { getSignedUrl, useSignedUrl, type MediaRow } from '../lib/media';
import { fetchShared, type SharedData, type SharedItem, type SharedLink } from '../lib/shared';
import { MediaViewer } from './MediaViewer';
import { formatSize } from './MessageBubble';
import { space, radius, fontSize, control } from '../theme/tokens';
import { font } from '../theme/type';

type Tab = 'media' | 'docs' | 'links';
type Row = { key: string; items: SharedItem[] };
type Section = { key: string; title: string; data: Row[] };

// The free Supabase tier gives 1 GB for the whole project.
const STORAGE_LIMIT = 1024 * 1024 * 1024;

const lift: any =
  Platform.OS === 'web'
    ? { boxShadow: '0 2px 8px rgba(17,27,33,0.08), 0 16px 40px rgba(17,27,33,0.10)' }
    : { elevation: 2 };

function monthKey(iso: string) {
  const d = new Date(iso);
  return d.getFullYear() + '_' + d.getMonth();
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function shortDate(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

function formatBytes(b: number) {
  if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  return formatSize(b);
}

function Segment({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const { c } = useTheme();
  const tabs: { id: Tab; label: string }[] = [
    { id: 'media', label: 'Media' },
    { id: 'docs', label: 'Docs' },
    { id: 'links', label: 'Links' },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={{ marginHorizontal: space[4], marginBottom: space[3], padding: space[1], flexDirection: 'row', backgroundColor: c.surfaceSubtle, borderRadius: 14 }}
    >
      {tabs.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => onTab(t.id)}
            style={[
              { flex: 1, height: control.sm, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
              active ? [{ backgroundColor: c.surface }, lift] : null,
            ]}
          >
            <Text style={{ color: active ? c.primary : c.textSecondary, fontSize: fontSize.label, fontFamily: font.semibold }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StorageCard({ bytes }: { bytes: number }) {
  const { c } = useTheme();
  const pct = Math.min(100, Math.round((bytes / STORAGE_LIMIT) * 100));
  const text = formatBytes(bytes) + ' of 1 GB';
  return (
    <View
      accessible
      accessibilityLabel={'Shared storage, ' + text}
      style={{ marginHorizontal: space[4], marginBottom: space[3], padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], borderRadius: radius.lg, backgroundColor: c.surfaceSubtle }}
    >
      <View style={{ width: 44, height: 44, borderRadius: radius.full, backgroundColor: c.hover, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="archive" color={c.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: c.text, fontSize: fontSize.label, fontFamily: font.semibold }}>Shared storage</Text>
        <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{text}</Text>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: pct }}
          style={{ flexDirection: 'row', height: 6, marginTop: 4, borderRadius: 3, overflow: 'hidden', backgroundColor: c.divider }}
        >
          <View style={{ flex: pct, backgroundColor: c.primary }} />
          <View style={{ flex: 100 - pct }} />
        </View>
      </View>
    </View>
  );
}

function StateBlock({ icon, title, body, action, onAction, alert }: { icon: IconName; title: string; body: string; action?: string; onAction?: () => void; alert?: boolean }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole={alert ? 'alert' : undefined} style={{ alignItems: 'center', padding: space[8], gap: space[2] }}>
      <Icon name={icon} size={32} color={c.textSecondary} />
      <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.5, marginTop: space[2], textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center', maxWidth: 300 }}>{body}</Text>
      {action && onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => ({ marginTop: space[3], minHeight: control.md, paddingHorizontal: space[5], borderRadius: radius.full, borderWidth: 1, borderColor: c.divider, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.hover : 'transparent' })}
        >
          <Text style={{ color: c.primary, fontSize: fontSize.label, fontFamily: font.semibold }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Skeleton() {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={{ paddingTop: space[2] }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ height: 64, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceSubtle }} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 12, width: '60%', borderRadius: 6, backgroundColor: c.surfaceSubtle }} />
            <View style={{ height: 10, width: '35%', borderRadius: 5, backgroundColor: c.surfaceSubtle }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Tile({ item, size, onPress }: { item: SharedItem; size: number; onPress: () => void }) {
  const { c } = useTheme();
  const url = useSignedUrl(item.media.storage_path);
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={'Open photo from ' + shortDate(item.createdAt)}
      onPress={onPress}
      style={{ width: size, height: size, padding: 1 }}
    >
      <View style={{ flex: 1, backgroundColor: c.surfaceSubtle }}>
        {url ? <Image source={{ uri: url, cacheKey: item.media.storage_path }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
      </View>
    </Pressable>
  );
}

function DocRow({ item, onPress }: { item: SharedItem; onPress: () => void }) {
  const { c } = useTheme();
  const m = item.media;
  const ext = (m.name.includes('.') ? (m.name.split('.').pop() ?? '') : '').toUpperCase().slice(0, 5);
  const meta = [formatSize(m.size_bytes), ext || null, shortDate(item.createdAt)].filter(Boolean).join(' \u00B7 ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Open ' + m.name}
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({ minHeight: 64, paddingHorizontal: space[4], paddingVertical: space[2], flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: pressed || hovered ? c.hover : 'transparent' })}
    >
      <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.file, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="doc" color={c.white} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: fontSize.label, fontFamily: font.semibold }}>{m.name}</Text>
        <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{meta}</Text>
      </View>
      <Icon name="download" color={c.textSecondary} />
    </Pressable>
  );
}

function LinkRow({ link, onPress }: { link: SharedLink; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={'Open ' + link.host}
      onPress={onPress}
      style={({ pressed, hovered }: any) => ({ minHeight: 64, paddingHorizontal: space[4], paddingVertical: space[2], flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: pressed || hovered ? c.hover : 'transparent' })}
    >
      <View style={{ width: 44, height: 44, borderRadius: radius.full, backgroundColor: c.surfaceSubtle, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="link" color={c.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: fontSize.label, fontFamily: font.semibold }}>{link.host}</Text>
        <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{link.url}</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: fontSize.caption, fontFamily: font.regular }}>{shortDate(link.createdAt)}</Text>
    </Pressable>
  );
}

export function SharedMedia({ variant, conversationId }: { variant: 'page' | 'pane'; conversationId: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('media');
  const [data, setData] = useState<SharedData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [gridW, setGridW] = useState(0);
  const [notice, setNotice] = useState('');
  const dataRef = useRef<SharedData | null>(null);
  const req = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const mine = ++req.current;
    if (refresh) setRefreshing(true);
    else if (!dataRef.current) setStatus('loading');
    try {
      const next = await fetchShared(conversationId);
      if (mine !== req.current) return;
      dataRef.current = next;
      setData(next);
      setStatus('ready');
    } catch {
      if (mine !== req.current) return;
      if (dataRef.current) setNotice("Couldn't refresh. Showing what was already here.");
      else setStatus('error');
    } finally {
      if (mine === req.current) setRefreshing(false);
    }
  }, [conversationId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const cols = Math.min(6, Math.max(3, Math.round(gridW / 96)));
  const cell = gridW > 0 ? Math.floor(gridW / cols) : 0;

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    if (!data) return out;
    for (const it of data.photos) {
      const k = monthKey(it.createdAt);
      let s = out[out.length - 1];
      if (!s || s.key !== k) {
        s = { key: k, title: monthLabel(it.createdAt), data: [] };
        out.push(s);
      }
      const last = s.data[s.data.length - 1];
      if (last && last.items.length < cols) last.items.push(it);
      else s.data.push({ key: it.messageId, items: [it] });
    }
    return out;
  }, [data, cols]);

  // Oldest first, like the swipe gallery in the chat.
  const viewerItems = useMemo<MediaRow[]>(() => (data ? data.photos.map((p) => p.media).reverse() : []), [data]);

  function openPhoto(p: SharedItem) {
    const i = viewerItems.findIndex((m) => m.id === p.media.id);
    if (i >= 0) setViewer(i);
  }

  async function openFile(m: MediaRow) {
    try {
      await Linking.openURL(await getSignedUrl(m.storage_path));
    } catch {
      setNotice("Couldn't open that file.");
    }
  }

  async function openLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      setNotice("Couldn't open that link.");
    }
  }

  const goChat = () => router.replace(('/chat/room?conversationId=' + conversationId) as never);
  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={c.primary} colors={[c.primary]} />;
  const header = <StorageCard bytes={data?.bytes ?? 0} />;
  const listPad = { paddingBottom: space[4] + (variant === 'page' ? 100 + insets.bottom : 0) };

  let body: ReactNode = null;
  if (!data) {
    body =
      status === 'error' ? (
        <StateBlock alert icon="refresh" title="Couldn't load this" body="Check your connection, then try again." action="Try again" onAction={() => load()} />
      ) : (
        <Skeleton />
      );
  } else if (tab === 'media') {
    body =
      gridW > 0 ? (
        <SectionList<Row, Section>
          sections={sections}
          keyExtractor={(r) => r.key}
          stickySectionHeadersEnabled
          refreshControl={refresh}
          contentContainerStyle={listPad}
          ListHeaderComponent={header}
          ListEmptyComponent={<StateBlock icon="media" title="Nothing shared yet" body="Photos you send will show up here." action="Send a message" onAction={goChat} />}
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: c.surface, paddingHorizontal: space[4], paddingVertical: space[2] }}>
              <Text accessibilityRole="header" style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.semibold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row' }}>
              {item.items.map((p) => (
                <Tile key={p.messageId} item={p} size={cell} onPress={() => openPhoto(p)} />
              ))}
            </View>
          )}
        />
      ) : null;
  } else if (tab === 'docs') {
    body = (
      <FlatList
        data={data.docs}
        keyExtractor={(d) => d.messageId}
        refreshControl={refresh}
        contentContainerStyle={listPad}
        ListHeaderComponent={header}
        ListEmptyComponent={<StateBlock icon="doc" title="No documents yet" body="Files you send will show up here." action="Send a message" onAction={goChat} />}
        renderItem={({ item }) => <DocRow item={item} onPress={() => openFile(item.media)} />}
      />
    );
  } else {
    body = (
      <FlatList
        data={data.links}
        keyExtractor={(l) => l.key}
        refreshControl={refresh}
        contentContainerStyle={listPad}
        ListHeaderComponent={header}
        ListEmptyComponent={<StateBlock icon="link" title="No links yet" body="Links you send will show up here." action="Send a message" onAction={goChat} />}
        renderItem={({ item }) => <LinkRow link={item} onPress={() => openLink(item.url)} />}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      {variant === 'page' && (
        <View style={{ paddingTop: insets.top + space[4], paddingHorizontal: space[5], paddingBottom: space[3] }}>
          <Text accessibilityRole="header" style={{ color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold, letterSpacing: -0.5 }}>Shared media</Text>
        </View>
      )}
      <Segment tab={tab} onTab={setTab} />
      {!!notice && (
        <View style={{ minHeight: 36, paddingHorizontal: space[3], paddingVertical: space[2], alignItems: 'center', justifyContent: 'center', backgroundColor: c.warningSurface }}>
          <Text style={{ color: c.warningText, fontSize: fontSize.meta, fontFamily: font.regular }}>{notice}</Text>
        </View>
      )}
      <View style={{ flex: 1 }} onLayout={(e) => setGridW(Math.floor(e.nativeEvent.layout.width))}>
        {body}
      </View>
      <MediaViewer items={viewerItems} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
    </View>
  );
}
