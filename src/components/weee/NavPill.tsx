import { Pressable, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../lib/icons';
import { useUnread } from '../../lib/unread';
import { useTheme } from '../../hooks/useTheme';
import { font } from '../../theme/type';

const ITEMS: { path: string; label: string; icon: IconName }[] = [
  { path: '/chat', label: 'Chats', icon: 'chat' },
  { path: '/weee', label: 'weee', icon: 'rings' },
  { path: '/calls', label: 'Calls', icon: 'phone' },
  { path: '/media', label: 'Media', icon: 'media' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

export function NavPill() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const { unread } = useUnread();

  const found = ITEMS.findIndex((i) => pathname.startsWith(i.path));
  const active = found < 0 ? 0 : found;

  if (pathname.startsWith('/chat/room')) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50, paddingBottom: insets.bottom, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider }}>
      <View
        accessibilityRole="tablist"
        style={{ width: '100%', height: 72, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'stretch' }}
      >
        {ITEMS.map((item, i) => {
          const on = i === active;
          return (
            <Pressable
              key={item.path}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: on }}
              onPress={() => router.navigate(item.path as never)}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, backgroundColor: on ? c.surfaceSubtle : 'transparent' }}
            >
              <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={item.icon} size={22} color={on ? c.primary : c.textSecondary} />
                {item.path === '/chat' && unread > 0 && (
                  <View style={{ position: 'absolute', top: -3, right: -5, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: c.onAccent, fontSize: 10, fontFamily: font.semibold }}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={{ color: on ? c.primary : c.textSecondary, fontSize: 11, fontFamily: on ? font.semibold : font.medium }}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
