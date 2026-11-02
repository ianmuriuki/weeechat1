import { View, Text } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Icon, type IconName } from '../lib/icons';
import { space, fontSize, lineHeight } from '../theme/tokens';
import { font } from '../theme/type';

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: space[8] }}>
      <Icon name={icon} size={32} color={c.textSecondary} />
      <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.5, marginTop: space[4] }}>{title}</Text>
      <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, lineHeight: fontSize.body * lineHeight.body, textAlign: 'center', marginTop: space[2], maxWidth: 320 }}>{body}</Text>
    </View>
  );
}
