import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { EmojiPanel } from './EmojiPanel';
import { GifPanel } from './GifPanel';
import type { GifPick } from '../lib/giphy';
import { fontSize } from '../theme/tokens';
import { font } from '../theme/type';

type Mode = 'emoji' | 'gif' | 'sticker';
const TABS: [Mode, string][] = [
  ['emoji', 'Emoji'],
  ['gif', 'GIF'],
  ['sticker', 'Stickers'],
];

// Emoji, GIFs and stickers share one panel above the keyboard, like WhatsApp.
export function MediaPanel({ onEmoji, onGif }: { onEmoji: (e: string) => void; onGif: (g: GifPick) => void }) {
  const { c } = useTheme();
  const [mode, setMode] = useState<Mode>('emoji');
  return (
    <View style={{ backgroundColor: c.surface }}>
      {mode === 'emoji' ? <EmojiPanel onPick={onEmoji} /> : <GifPanel key={mode} kind={mode} onPick={onGif} />}
      <View accessibilityRole="tablist" style={{ height: 44, flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.divider }}>
        {TABS.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: mode === value }}
            onPress={() => setMode(value)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderTopWidth: 2, borderTopColor: mode === value ? c.primary : 'transparent' }}
          >
            <Text style={{ color: mode === value ? c.primary : c.textSecondary, fontSize: fontSize.label, fontFamily: mode === value ? font.semibold : font.medium }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
