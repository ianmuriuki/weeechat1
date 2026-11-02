import { ScrollView, View, Text } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Icon, iconNames } from '../lib/icons';
import { space, fontSize } from '../theme/tokens';

export default function IconGallery() {
  const { c } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: space[4], gap: space[2] }}>
      {iconNames.map((n) => (
        <View key={n} style={{ width: 88, alignItems: 'center', paddingVertical: space[3] }}>
          <Icon name={n} size={24} color={c.text} />
          <Text style={{ color: c.textSecondary, fontSize: fontSize.caption, marginTop: space[1] }}>{n}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
