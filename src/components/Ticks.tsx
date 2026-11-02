import { Pressable, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';

export type TickState = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

const labels: Record<TickState, string> = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not sent. Tap to try again',
};

export function Ticks({ state, onRetry }: { state: TickState; onRetry?: () => void }) {
  const { c } = useTheme();
  const box = { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' } as const;

  if (state === 'failed') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={labels.failed} onPress={onRetry} hitSlop={12} style={box}>
        <Icon name="info" size={16} color={c.danger} />
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={labels[state]} style={box}>
      {state === 'sending' && <Icon name="clock" size={13} color={c.textSecondary} />}
      {state === 'sent' && <Icon name="check" size={14} color={c.textSecondary} />}
      {state === 'delivered' && <Icon name="doubleCheck" size={18} color={c.textSecondary} />}
      {state === 'read' && <Icon name="readCheck" size={18} color={c.read} />}
    </View>
  );
}
