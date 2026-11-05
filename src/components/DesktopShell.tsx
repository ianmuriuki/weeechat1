import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useInbox } from '../lib/inbox';
import { Icon, type IconName } from '../lib/icons';
import { Avatar, IconButton } from './Primitives';
import { Logo } from './Logo';
import { timeLabel } from './MessageBubble';
import { space, radius, fontSize } from '../theme/tokens';
import { font } from '../theme/type';

const pages: { path: string; label: string; icon: IconName }[] = [
  { path: '/chat', label: 'Chats', icon: 'chat' },
  { path: '/weee', label: 'weee', icon: 'rings' },
  { path: '/calls', label: 'Calls', icon: 'phone' },
];

function shortWhen(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString()
    ? timeLabel(iso)
    : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const lift: any =
  Platform.OS === 'web'
    ? { boxShadow: '0 2px 8px rgba(17,27,33,0.08), 0 16px 40px rgba(17,27,33,0.10)' }
    : { elevation: 2 };

export function DesktopShell({ userId }: { userId: string }) {
  const { c, isDark, toggle } = useTheme();
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const { conversations, error: chatError, typing } = useInbox();
  const go = (path: string) => router.replace(path as never);
  const sidebarWidth = width <= 1120 ? 340 : 400;
  const onChat = pathname.startsWith('/chat') || pathname === '/';

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.surface }}>
      <View style={{ width: sidebarWidth, borderRightWidth: 1, borderRightColor: c.divider, backgroundColor: c.surface }}>
        <View style={{ height: 76, paddingLeft: space[6], paddingRight: space[5], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Logo size={28} stroke={c.primary} fill={c.surface} />
            <Text style={{ color: c.primary, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.4 }}>Weeez</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon={isDark ? 'sun' : 'moon'} label={isDark ? 'Use light theme' : 'Use dark theme'} onPress={toggle} />
            <IconButton icon="settings" label="Settings" onPress={() => go('/settings')} />
          </View>
        </View>

        <View accessibilityRole="tablist" style={{ marginHorizontal: space[5], marginBottom: space[4], padding: space[1], flexDirection: 'row', backgroundColor: c.surfaceSubtle, borderRadius: 14 }}>
          {pages.map((p) => {
            const active = pathname.startsWith(p.path);
            return (
              <Pressable
                key={p.path}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => go(p.path)}
                style={[
                  { flex: 1, height: control48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10 },
                  active ? [{ backgroundColor: c.surface }, lift] : null,
                ]}
              >
                <Icon name={p.icon} size={19} color={active ? c.primary : c.textSecondary} />
                <Text style={{ color: active ? c.primary : c.textSecondary, fontSize: 13, fontFamily: font.semibold }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {onChat && (
          <View>
            <View style={{ height: 44, paddingHorizontal: space[6], justifyContent: 'center' }}>
              <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.semibold, letterSpacing: 0.7, textTransform: 'uppercase' }}>Messages</Text>
            </View>
            {chatError ? (
              <Text style={{ paddingHorizontal: space[5], color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{chatError}</Text>
            ) : conversations.length === 0 ? (
              <Text style={{ paddingHorizontal: space[5], color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>No chats yet.</Text>
            ) : conversations.map((conversation) => {
              const name = conversation.kind === 'direct' ? conversation.other?.display_name ?? 'Chat' : conversation.title ?? 'Group chat';
              const last = conversation.last;
              const preview = last
                ? last.deleted_at ? 'This message was deleted' : last.kind === 'image' ? 'Photo' : last.kind === 'file' ? 'File' : last.kind === 'voice' ? 'Voice message' : last.body ?? ''
                : 'No messages yet';
              return (
                <Pressable
                  key={conversation.id}
                  accessibilityRole="button"
                  accessibilityLabel={'Open chat with ' + name}
                  onPress={() => go('/chat/room?conversationId=' + conversation.id)}
                  style={({ hovered }: any) => ({ minHeight: 76, paddingVertical: 10, paddingLeft: space[5], paddingRight: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: hovered ? c.hover : 'transparent' })}
                >
                  <Avatar name={name} color={c.avatarIann} path={conversation.kind === 'direct' ? conversation.other?.avatar_path : conversation.avatar_path} />
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontSize: 15, fontFamily: font.semibold }}>{name}</Text>
                      {last && <Text style={{ color: conversation.unread > 0 ? c.primary : c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{shortWhen(last.created_at)}</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: typing[conversation.id] ? c.primary : c.textSecondary, fontSize: fontSize.meta, fontFamily: typing[conversation.id] ? font.medium : font.regular }}>{typing[conversation.id] ? 'typing' : preview}</Text>
                      {conversation.unread > 0 && <View style={{ minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.onAccent, fontSize: fontSize.caption, fontFamily: font.semibold }}>{conversation.unread > 99 ? '99+' : conversation.unread}</Text></View>}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Slot />
      </View>
    </View>
  );
}

const control48 = 48;
