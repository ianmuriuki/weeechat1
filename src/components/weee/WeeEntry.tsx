import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '../../lib/icons';
import { useChatWee, useWeeLink } from '../../lib/weeLink';
import { useSession } from '../../lib/session';
import { useTheme } from '../../hooks/useTheme';
import { font } from '../../theme/type';
import { fontSize, radius, space } from '../../theme/tokens';

// The Wee row in a direct chat's info screen. Hidden until the admin switches Wee on for this account.
export function WeeEntry({ conversationId }: { conversationId: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { allowed } = useWeeLink();
  const { link } = useChatWee(conversationId);
  if (!allowed && !link) return null;
  const uid = session?.user.id;
  const name = link?.partner_name?.trim() || 'this friend';
  const line = !link
    ? 'A private space for the two of you. Ask ' + name + ' to link.'
    : link.status === 'active'
      ? 'Open your shared space with ' + name
      : link.status === 'pending_partner'
        ? link.requested_by === uid ? 'Waiting for ' + name + ' to confirm' : name + ' wants to link with you'
        : 'Waiting for the admin to approve';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(('/weee?conversationId=' + conversationId) as never)}
      style={({ pressed }) => ({ marginHorizontal: space[4], marginTop: space[3], padding: space[4], minHeight: 76, borderRadius: radius.lg, backgroundColor: pressed ? c.hover : c.surfaceSubtle })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>Wee</Text>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{line}</Text>
        </View>
        <Icon name="chevron" size={18} color={c.textSecondary} />
      </View>
    </Pressable>
  );
}
