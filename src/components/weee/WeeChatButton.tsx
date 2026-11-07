import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '../../lib/icons';
import { useChatWee } from '../../lib/weeLink';
import { useTheme } from '../../hooks/useTheme';

// A small round shortcut to Wee inside a chat. It only exists while this chat has an active Wee link.
export function WeeChatButton({ conversationId, top }: { conversationId: string; top: number }) {
  const { c } = useTheme();
  const router = useRouter();
  const { link } = useChatWee(conversationId);
  if (!link || link.status !== 'active') return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 12, top, zIndex: 10, elevation: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Wee"
        onPress={() => router.push(('/weee?conversationId=' + conversationId) as never)}
        hitSlop={6}
        style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.hover : c.surface, borderWidth: 1, borderColor: c.divider })}
      >
        <Icon name="rings" size={20} color={c.primary} />
      </Pressable>
    </View>
  );
}
