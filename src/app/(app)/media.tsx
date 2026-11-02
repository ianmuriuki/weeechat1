import { Text, View, useWindowDimensions } from 'react-native';
import { Logo } from '../../components/Logo';
import { SharedMedia } from '../../components/SharedMedia';
import { useTheme } from '../../hooks/useTheme';
import { space, fontSize, lineHeight } from '../../theme/tokens';
import { font } from '../../theme/type';

export default function Media() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();

  // On desktop the lists sit in the left pane, so this pane only waits for a choice.
  if (width > 820) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', padding: space[8] }}>
        <Logo size={64} stroke={c.primary} fill={c.surface} />
        <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.5, marginTop: space[4] }}>Choose something to open.</Text>
        <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, lineHeight: fontSize.body * lineHeight.body, textAlign: 'center', marginTop: space[2], maxWidth: 320 }}>
          Select an item from the left to see details here.
        </Text>
      </View>
    );
  }

  return <SharedMedia variant="page" />;
}
