import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';
import { IconButton } from './Primitives';
import { ViewBadge } from './ViewBadge';
import { formatSize } from './MessageBubble';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import type { Picked } from '../lib/media';
import { space, radius, fontSize, control, size } from '../theme/tokens';
import { font } from '../theme/type';

export type PreviewItem = { picked: Picked; caption: string; twice: boolean };

export function SendPreview({
  picks,
  toName,
  onCancel,
  onSend,
}: {
  picks: Picked[];
  toName: string;
  onCancel: () => void;
  onSend: (items: PreviewItem[]) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [items, setItems] = useState<PreviewItem[]>(() => picks.map((p) => ({ picked: p, caption: '', twice: false })));
  const [index, setIndex] = useState(0);

  const safeIndex = Math.min(index, items.length - 1);
  const cur = items[safeIndex];
  if (!cur) return null;
  const multi = items.length > 1;
  const isImage = cur.picked.kind === 'image';

  const patch = (fn: (it: PreviewItem) => PreviewItem) =>
    setItems((prev) => prev.map((it, i) => (i === safeIndex ? fn(it) : it)));

  function removeCurrent() {
    if (items.length <= 1) {
      onCancel();
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== safeIndex));
    setIndex(Math.max(0, Math.min(safeIndex, items.length - 2)));
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: c.nativeCanvas, paddingBottom: kb }}>
        <View style={{ paddingTop: insets.top + space[2], paddingHorizontal: space[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Cancel" color={c.white} onPress={onCancel} />
          {multi && <IconButton icon="trash" label="Remove this photo" color={c.white} onPress={removeCurrent} />}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[4] }}>
          {isImage ? (
            <Image source={{ uri: cur.picked.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          ) : (
            <View style={{ width: '100%', maxWidth: 360, alignItems: 'center', gap: space[3], padding: space[6], borderRadius: radius.lg, backgroundColor: c.white12 }}>
              <View style={{ width: 64, height: 64, borderRadius: radius.lg, backgroundColor: c.file, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="doc" size={32} color={c.white} />
              </View>
              <Text numberOfLines={2} style={{ color: c.white, fontSize: fontSize.body, fontFamily: font.semibold, textAlign: 'center' }}>{cur.picked.name}</Text>
              <Text style={{ color: c.white70, fontSize: fontSize.meta, fontFamily: font.regular }}>{cur.picked.size ? formatSize(cur.picked.size) : ''}</Text>
            </View>
          )}
        </View>

        {cur.twice && (
          <Text style={{ color: c.white70, fontSize: fontSize.meta, fontFamily: font.regular, textAlign: 'center', marginBottom: space[2] }}>
            {toName + ' can open this photo twice'}
          </Text>
        )}

        {multi && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: space[2] }} contentContainerStyle={{ paddingHorizontal: space[3], gap: space[2] }}>
            {items.map((it, i) => (
              <Pressable
                key={it.picked.uri}
                accessibilityRole="button"
                accessibilityLabel={'Photo ' + (i + 1) + ' of ' + items.length}
                accessibilityState={{ selected: i === safeIndex }}
                onPress={() => setIndex(i)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: i === safeIndex ? c.accent : 'transparent',
                  backgroundColor: c.white12,
                }}
              >
                <Image source={{ uri: it.picked.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                {it.twice && (
                  <View style={{ position: 'absolute', right: 2, bottom: 2 }}>
                    <ViewBadge value={2} size={16} color={c.accent} filled textColor={c.onAccent} />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={{ paddingHorizontal: space[3], paddingBottom: (kb > 0 ? 0 : insets.bottom) + space[3], flexDirection: 'row', alignItems: 'flex-end', gap: space[2] }}>
          {!multi && (
            <View style={{ width: control.md, height: control.md, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.white12, alignItems: 'center', justifyContent: 'center' }}>
              {isImage ? <Image source={{ uri: cur.picked.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Icon name="doc" color={c.white} />}
            </View>
          )}

          <View style={{ flex: 1, minHeight: control.md, flexDirection: 'row', alignItems: 'flex-end', borderRadius: radius.xl, backgroundColor: c.white14, paddingLeft: space[4], paddingRight: space[2] }}>
            <TextInput
              accessibilityLabel="Caption"
              placeholder="Add a caption"
              placeholderTextColor={c.white70}
              value={cur.caption}
              onChangeText={(t) => patch((it) => ({ ...it, caption: t }))}
              maxLength={1000}
              multiline
              style={{ flex: 1, maxHeight: 120, paddingTop: 13, paddingBottom: 13, color: c.white, fontFamily: font.regular, fontSize: fontSize.label, lineHeight: 20 }}
            />
            {isImage && (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: cur.twice }}
                accessibilityLabel="View twice"
                onPress={() => patch((it) => ({ ...it, twice: !it.twice }))}
                hitSlop={8}
                style={{ width: 36, height: control.md, alignItems: 'center', justifyContent: 'center' }}
              >
                <ViewBadge value={2} size={26} color={cur.twice ? c.accent : c.white70} filled={cur.twice} textColor={c.onAccent} />
              </Pressable>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={multi ? 'Send ' + items.length + ' photos' : 'Send'}
            onPress={() => onSend(items)}
            style={({ pressed }) => ({
              width: size.fab,
              height: size.fab,
              borderRadius: radius.full,
              backgroundColor: c.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.92 : 1,
            })}
          >
            <Icon name="send" color={c.onPrimary} />
            {multi && (
              <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.white, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.nativeCanvas, fontSize: fontSize.caption, fontFamily: font.semibold }}>{items.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
