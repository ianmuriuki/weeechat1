import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './Primitives';
import { useSignedUrl, type MediaRow } from '../lib/media';
import { space, fontSize } from '../theme/tokens';
import { font } from '../theme/type';

export function MediaViewer({
  items,
  index,
  onIndex,
  onClose,
  note,
}: {
  items: MediaRow[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  note?: string;
}) {
  const insets = useSafeAreaInsets();
  const item = index != null ? items[index] : null;
  const url = useSignedUrl(item?.storage_path);
  const single = items.length <= 1;

  return (
    <Modal visible={index != null && !!item} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
        <View style={{ paddingTop: insets.top + space[2], paddingHorizontal: space[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="close" label="Close viewer" color="#ffffff" onPress={onClose} />
          {item && (
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize.meta, fontFamily: font.regular, paddingRight: space[3] }}>
              {note ?? new Date(item.created_at).toLocaleString()}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {url ? <Image source={{ uri: url, cacheKey: item?.storage_path }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : <ActivityIndicator color="#ffffff" />}
        </View>
        {!single && (
          <View style={{ paddingBottom: insets.bottom + space[2], paddingHorizontal: space[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <IconButton icon="chevron" label="Previous photo" color="#ffffff" disabled={index == null || index <= 0} onPress={() => index != null && onIndex(index - 1)} />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: fontSize.meta, fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>
              {index != null ? index + 1 : 0} of {items.length}
            </Text>
            <IconButton icon="chevron" label="Next photo" color="#ffffff" disabled={index == null || index >= items.length - 1} onPress={() => index != null && onIndex(index + 1)} />
          </View>
        )}
        {single && <View style={{ height: insets.bottom + space[4] }} />}
      </View>
    </Modal>
  );
}
