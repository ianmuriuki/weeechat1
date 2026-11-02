import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { IconButton } from '../Primitives';
import { useWeee } from '../../theme/weee';
import { font } from '../../theme/type';

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { w } = useWeee();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? w.ink : w.ink + '14' }}
    >
      <Text style={{ color: active ? w.paper : w.ink, fontSize: 14, fontFamily: font.medium }}>{label}</Text>
    </Pressable>
  );
}

// placement 'bottom' is the sheet that slides from the bottom. 'center' is a card in the middle of the screen.
export function WeeeSheet({ title, onClose, children, placement = 'bottom' }: { title: string; onClose: () => void; children: ReactNode; placement?: 'bottom' | 'center' }) {
  const { c } = useTheme();
  const { w } = useWeee();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const center = placement === 'center';
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: c.scrim, justifyContent: center ? 'center' : 'flex-end', alignItems: 'center', paddingBottom: kb, paddingTop: center ? insets.top + 16 : 0, paddingHorizontal: center ? 20 : 0 }}
      >
        <Pressable
          onPress={() => {}}
          style={
            center
              ? { width: '100%', maxWidth: 480, maxHeight: '100%', gap: 16, padding: 20, borderRadius: 28, backgroundColor: w.paper }
              : { width: '100%', maxWidth: 520, gap: 16, paddingTop: 8, paddingHorizontal: 20, paddingBottom: kb > 0 ? 20 : insets.bottom + 24, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: w.paper }
          }
        >
          {!center && <View style={{ width: 40, height: 4, borderRadius: 2, alignSelf: 'center', backgroundColor: w.ink + '40' }} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: w.ink, fontSize: 20, fontFamily: font.semibold, letterSpacing: -0.4 }}>{title}</Text>
            <IconButton icon="close" label={'Close ' + title} color={w.ink} onPress={onClose} />
          </View>
          {center ? (
            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
