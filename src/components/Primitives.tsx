import { Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../hooks/useTheme';
import { useAvatarUrl } from '../lib/avatar';
import { Icon, type IconName } from '../lib/icons';
import { control, size } from '../theme/tokens';
import { font } from '../theme/type';

export function IconButton({ icon, label, onPress, disabled, color }: { icon: IconName; label: string; onPress?: () => void; disabled?: boolean; color?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={{ width: control.md, height: control.md, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}
    >
      {({ pressed }) => (
        <View style={{ width: size.iconVisual, height: size.iconVisual, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.hover : 'transparent' }}>
          <Icon name={icon} color={color ?? c.textSecondary} />
        </View>
      )}
    </Pressable>
  );
}

export function Avatar({ name, diameter = control.avatarMd, color, path }: { name: string; diameter?: number; color: string; path?: string | null }) {
  const { c } = useTheme();
  const url = useAvatarUrl(path);
  return (
    <View style={{ width: diameter, height: diameter, borderRadius: 999, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.white, fontFamily: font.semibold, fontSize: diameter * 0.4 }}>{name.trim().charAt(0).toUpperCase()}</Text>
      {url ? <Image source={{ uri: url, cacheKey: path ?? undefined }} style={{ position: 'absolute', width: diameter, height: diameter, borderRadius: diameter / 2 }} contentFit="cover" /> : null}
    </View>
  );
}
