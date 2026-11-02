import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { setWallpaper, useWallpaper } from '../lib/wallpaper';
import { space, radius, fontSize, control } from '../theme/tokens';
import { font } from '../theme/type';

const options = [
  { key: 'doodles', label: 'Doodles' },
  { key: 'plain', label: 'Plain' },
] as const;

export function WallpaperSetting() {
  const { c } = useTheme();
  const pref = useWallpaper();
  return (
    <View>
      <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.semibold, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: space[8], marginBottom: space[2] }}>
        Chat background
      </Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: space[1], backgroundColor: c.surfaceSubtle, borderRadius: radius.md, maxWidth: 420 }}>
        {options.map((o) => {
          const active = pref === o.key;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => setWallpaper(o.key)}
              style={{ flex: 1, height: control.sm, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.surface : 'transparent' }}
            >
              <Text style={{ color: active ? c.primary : c.textSecondary, fontSize: fontSize.label, fontFamily: font.semibold }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
