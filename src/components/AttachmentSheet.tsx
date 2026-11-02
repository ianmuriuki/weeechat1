import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { Icon, type IconName } from '../lib/icons';
import { IconButton } from './Primitives';
import { space, fontSize } from '../theme/tokens';
import { font } from '../theme/type';

export type AttachSource = 'document' | 'camera' | 'gallery';

export function AttachmentSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (s: AttachSource) => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const items: { key: AttachSource; label: string; icon: IconName; color: string }[] = [
    { key: 'document', label: 'Document', icon: 'doc', color: c.attachmentDocument },
    { key: 'camera', label: 'Camera', icon: 'camera', color: c.attachmentCamera },
    { key: 'gallery', label: 'Gallery', icon: 'gallery', color: c.attachmentGallery },
  ];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 430,
            backgroundColor: c.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: space[2],
            paddingHorizontal: space[5],
            paddingBottom: space[6] + insets.bottom,
          }}
        >
          <View style={{ width: 38, height: 4, borderRadius: 4, backgroundColor: c.divider, alignSelf: 'center', marginBottom: space[1] }} />
          <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.5 }}>Share</Text>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: space[2] }}>
            {items.map((it) => (
              <Pressable key={it.key} accessibilityRole="button" accessibilityLabel={it.label} onPress={() => onPick(it.key)} style={{ alignItems: 'center', gap: space[2], minWidth: 88 }}>
                <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: it.color, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={it.icon} color={c.white} />
                </View>
                <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{it.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
