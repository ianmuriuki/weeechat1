import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

// Fixed strip over the phone status bar. Put it last inside any screen that scrolls,
// so content never runs over the clock and the notification icons.
export function StatusBarCover({ color }: { color?: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (insets.top <= 0) return null;
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: insets.top, backgroundColor: color ?? c.surface, zIndex: 10 }} />;
}
