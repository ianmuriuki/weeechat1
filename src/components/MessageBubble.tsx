import { Fragment, useState } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';
import { ViewBadge } from './ViewBadge';
import { VoiceContent } from './VoiceContent';
import { Ticks, type TickState } from './Ticks';
import type { Message } from '../lib/chat';
import { splitLinks } from '../lib/links';
import { useSignedUrl, type MediaRow } from '../lib/media';
import { radius, fontSize, lineHeight } from '../theme/tokens';
import { font } from '../theme/type';

export function timeLabel(iso: string) {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function tickState(m: Message): TickState {
  if (m.failed) return 'failed';
  if (m.pending) return 'sending';
  if (m.read_at) return 'read';
  if (m.delivered_at) return 'delivered';
  return 'sent';
}

const hairline: any =
  Platform.OS === 'web'
    ? { boxShadow: '0 1px 1px rgba(17,27,33,0.08)' }
    : { shadowColor: '#111b21', shadowOpacity: 0.08, shadowRadius: 0, shadowOffset: { width: 0, height: 1 } };

function ImageContent({ message, media, onOpen, onLongPress }: { message: Message; media?: MediaRow; onOpen: () => void; onLongPress?: () => void }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const [bad, setBad] = useState(false);
  const [tries, setTries] = useState(0);
  const local = message.local?.picked;
  const url = useSignedUrl(local ? null : media?.storage_path);
  const w = local?.width ?? media?.width ?? 4;
  const h = local?.height ?? media?.height ?? 3;
  const boxW = Math.min(260, width * 0.85 - 20);
  const boxH = Math.max(120, Math.min(320, Math.round(boxW * (h && w ? h / w : 0.75))));
  const uri = local?.uri ?? url;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={bad ? "Photo didn't load. Tap to try again" : 'Open photo'}
      onPress={bad ? () => { setBad(false); setTries((t) => t + 1); } : onOpen}
      onLongPress={onLongPress}
      style={{
        width: boxW,
        height: boxH,
        marginHorizontal: -5,
        marginTop: -3,
        marginBottom: 4,
        borderRadius: 9,
        overflow: 'hidden',
        backgroundColor: c.surfaceSubtle,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: message.pending ? 0.6 : 1,
      }}
    >
      {bad ? (
        <View style={{ alignItems: 'center', gap: 6, padding: 12 }}>
          <Icon name="media" size={28} color={c.textSecondary} />
          <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular, textAlign: 'center' }}>Couldn't load this photo. Tap to try again.</Text>
        </View>
      ) : uri ? (
        <Image key={tries} source={{ uri, cacheKey: media?.storage_path }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={120} onError={() => setBad(true)} />
      ) : null}
    </Pressable>
  );
}

function LimitedContent({ message, mine, onOpen, onLongPress }: { message: Message; mine: boolean; onOpen: () => void; onLongPress?: () => void }) {
  const { c } = useTheme();
  const max = message.max_views ?? 0;
  const used = message.views_used;
  const left = Math.max(0, max - used);
  const done = left === 0;
  const sub = mine
    ? used === 0 ? 'Not opened yet' : done ? 'Opened' : 'Opened ' + used + ' of ' + max
    : done ? 'Opened' : left + (left === 1 ? ' view left' : ' views left');
  const tappable = !mine && !done && !message.pending;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Photo, ' + sub}
      onPress={tappable ? onOpen : undefined}
      onLongPress={onLongPress}
      style={{ minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingRight: 8 }}
    >
      <ViewBadge value={left} size={28} color={done ? c.textSecondary : c.primary} dashed={!done} />
      <View>
        <Text style={{ color: c.text, fontSize: 14, fontFamily: font.medium }}>Photo</Text>
        <Text style={{ color: c.textSecondary, fontSize: 10, fontFamily: font.regular }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function FileContent({ message, media, onOpen, onLongPress }: { message: Message; media?: MediaRow; onOpen: () => void; onLongPress?: () => void }) {
  const { c } = useTheme();
  const name = message.local?.picked.name ?? media?.name ?? 'File';
  const size = message.local?.picked.size ?? media?.size_bytes;
  const ext = (name.includes('.') ? (name.split('.').pop() ?? '') : '').toUpperCase().slice(0, 5);
  const detail = [size != null ? formatSize(size) : null, ext || null].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Open ' + name}
      onPress={onOpen}
      onLongPress={onLongPress}
      style={{
        minWidth: 240,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 9,
        marginHorizontal: -3,
        marginTop: -2,
        marginBottom: 2,
        borderRadius: 9,
        backgroundColor: c.overlaySoft,
        opacity: message.pending ? 0.6 : 1,
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: c.file, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="doc" color={c.white} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontFamily: font.semibold }}>{name}</Text>
        <Text style={{ color: c.textSecondary, fontSize: 10, fontFamily: font.regular }}>{detail}</Text>
      </View>
      <Icon name="download" color={c.textSecondary} />
    </Pressable>
  );
}

export function MessageBubble({
  message,
  media,
  mine,
  firstOfGroup,
  wide,
  onRetry,
  onOpen,
  onLongPress,
  quote,
  reactions,
  bare,
  senderName,
  senderAvatar,
  onLink,
}: {
  message: Message;
  media?: MediaRow;
  mine: boolean;
  firstOfGroup: boolean;
  wide: boolean;
  onRetry: () => void;
  onOpen: () => void;
  onLongPress?: () => void;
  quote?: { name: string; text: string; bar: string; onPress: () => void } | null;
  reactions?: { emojis: string[]; total: number } | null;
  bare?: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  onLink?: (url: string) => void;
}) {
  const { c } = useTheme();
  const deleted = !!message.deleted_at;
  const tail = firstOfGroup ? (mine ? { borderTopRightRadius: radius.tail } : { borderTopLeftRadius: radius.tail }) : null;
  // Invisible spaces reserve room so the time and ticks never cover the last line of text.
  const edited = !!message.edited_at && !deleted;
  const spacer = '\u00A0'.repeat((mine ? 17 : 11) + (edited ? 9 : 0));
  const parts = deleted || !message.body ? null : splitLinks(message.body);
  const limited = message.kind === 'image' && !!message.max_views;

  return (
    <Pressable
      accessible={false}
      onLongPress={onLongPress}
      delayLongPress={320}
      {...({ onContextMenu: (e: any) => { e?.preventDefault?.(); onLongPress?.(); } } as any)}
      style={[
        {
          alignSelf: mine ? 'flex-end' : 'flex-start',
          maxWidth: wide ? 600 : '85%',
          backgroundColor: mine ? c.bubbleOutgoing : c.bubbleIncoming,
          borderRadius: radius.bubble,
          paddingTop: 7,
          paddingBottom: 7,
          paddingHorizontal: 9,
          marginTop: bare ? 0 : firstOfGroup ? 8 : 2,
          marginBottom: !bare && reactions ? 14 : 0,
        },
        hairline,
        tail,
      ]}
    >
      {!deleted && quote && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Reply to ' + quote.name}
          onPress={quote.onPress}
          onLongPress={onLongPress}
          style={{ flexDirection: 'row', borderRadius: 7, overflow: 'hidden', backgroundColor: c.overlaySoft, marginBottom: 4, marginHorizontal: -2 }}
        >
          <View style={{ width: 4, backgroundColor: quote.bar }} />
          <View style={{ flexShrink: 1, paddingVertical: 5, paddingHorizontal: 8 }}>
            <Text numberOfLines={1} style={{ color: quote.bar, fontSize: 12, fontFamily: font.semibold }}>{quote.name}</Text>
            <Text numberOfLines={2} style={{ color: c.textSecondary, fontSize: 13, fontFamily: font.regular }}>{quote.text}</Text>
          </View>
        </Pressable>
      )}
      {!deleted && message.kind === 'image' && (limited ? (
        <LimitedContent message={message} mine={mine} onOpen={onOpen} onLongPress={onLongPress} />
      ) : (
        <ImageContent message={message} media={media} onOpen={onOpen} onLongPress={onLongPress} />
      ))}
      {!deleted && message.kind === 'file' && <FileContent message={message} media={media} onOpen={onOpen} onLongPress={onLongPress} />}
      {!deleted && message.kind === 'voice' && <VoiceContent message={message} media={media} mine={mine} senderName={senderName} senderAvatar={senderAvatar} onLongPress={onLongPress} />}
      <Text
        style={{
          display: message.kind === 'voice' && !deleted ? 'none' : 'flex',
          color: deleted ? c.textSecondary : c.text,
          fontFamily: font.regular,
          fontStyle: deleted ? 'italic' : 'normal',
          fontSize: fontSize.message,
          lineHeight: Math.round(fontSize.message * lineHeight.message),
        }}
      >
        {deleted
          ? 'This message was deleted'
          : parts
            ? parts.map((p, i) =>
                p.url ? (
                  <Text
                    key={i}
                    accessibilityRole="link"
                    onPress={() => onLink?.(p.url as string)}
                    onLongPress={onLongPress}
                    style={{ color: c.link, textDecorationLine: 'underline' }}
                  >
                    {p.text}
                  </Text>
                ) : (
                  <Fragment key={i}>{p.text}</Fragment>
                ),
              )
            : (message.body ?? '')}
        {spacer}
      </Text>
      <View style={{ position: 'absolute', right: 9, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ color: c.textSecondary, fontFamily: font.regular, fontSize: 10, fontVariant: ['tabular-nums'] }}>
          {(edited ? 'Edited ' : '') + timeLabel(message.created_at)}
        </Text>
        {mine && <Ticks state={tickState(message)} onRetry={onRetry} />}
      </View>
      {!bare && !deleted && reactions && (
        <View
          style={{
            position: 'absolute',
            bottom: -12,
            [mine ? 'right' : 'left']: 8,
            height: 22,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 7,
            borderRadius: 11,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.divider,
          }}
        >
          {reactions.emojis.map((e) => (
            <Text key={e} style={{ fontSize: 13 }}>{e}</Text>
          ))}
          {reactions.total > 1 && <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: font.medium }}>{reactions.total}</Text>}
        </View>
      )}
    </Pressable>
  );
}
