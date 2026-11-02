import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../lib/icons';
import { useUnread } from '../../lib/unread';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { useTheme } from '../../hooks/useTheme';
import { useWeee } from '../../theme/weee';
import { font } from '../../theme/type';

const ITEMS: { path: string; label: string; icon: IconName }[] = [
  { path: '/chat', label: 'Chats', icon: 'chat' },
  { path: '/weee', label: 'weee', icon: 'rings' },
  { path: '/calls', label: 'Calls', icon: 'phone' },
  { path: '/media', label: 'Media', icon: 'media' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

const PAD = 8;
const CIRCLE = 44;
const lift: any = Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.28)' } : { elevation: 8 };

// Floating pill for phones. It follows the theme, shows icons only, and a white circle slides to the open tab.
// It hides inside the chat room and while the keyboard is open.
export function NavPill() {
  const { c, isDark } = useTheme();
  const { w } = useWeee();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const kb = useKeyboardHeight();
  const { unread } = useUnread();

  const found = ITEMS.findIndex((i) => pathname.startsWith(i.path));
  const active = found < 0 ? 0 : found;
  const [width, setWidth] = useState(0);
  const slot = width > 0 ? (width - PAD * 2) / ITEMS.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!slot) return;
    const to = PAD + active * slot + (slot - CIRCLE) / 2;
    if (!placed.current) {
      x.setValue(to);
      placed.current = true;
    } else {
      Animated.spring(x, { toValue: to, useNativeDriver: Platform.OS !== 'web', bounciness: 5 }).start();
    }
  }, [active, slot, x]);

  if (kb > 0 || pathname.startsWith('/chat/room')) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 12, zIndex: 50, alignItems: 'center' }}>
      <View
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[
          { width: '100%', maxWidth: 460, height: 64, borderRadius: 32, paddingHorizontal: PAD, flexDirection: 'row', alignItems: 'center', backgroundColor: w.deep, borderWidth: isDark ? 1 : 0, borderColor: 'rgba(255,255,255,0.1)' },
          lift,
        ]}
      >
        {slot > 0 && (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: (64 - CIRCLE) / 2 - (isDark ? 1 : 0), width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, backgroundColor: '#ffffff', transform: [{ translateX: x }] }} />
        )}
        {ITEMS.map((item, i) => {
          const on = i === active;
          return (
            <Pressable
              key={item.path}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: on }}
              onPress={() => router.navigate(item.path as never)}
              style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }}
            >
              <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={item.icon} size={24} color={on ? '#14181b' : w.onDeep + 'cc'} />
                {item.path === '/chat' && unread > 0 && (
                  <View style={{ position: 'absolute', top: 4, right: 2, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: c.onAccent, fontSize: 10, fontFamily: font.semibold }}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
