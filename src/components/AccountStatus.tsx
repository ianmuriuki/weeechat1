import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useSession } from '../lib/session';
import { signOutAndUnregister } from '../lib/push';
import { font } from '../theme/type';
import { control, fontSize, radius, space } from '../theme/tokens';

export function AccountStatus({ rejected }: { rejected: boolean }) {
  const { c } = useTheme();
  const { refreshProfile } = useSession();
  const [busy, setBusy] = useState(false);

  async function checkAgain() {
    setBusy(true);
    await refreshProfile();
    setBusy(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, padding: space[6], justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 420, gap: space[4] }}>
        <Text style={{ color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold }}>
          {rejected ? 'Account not approved' : 'Approval pending'}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, lineHeight: 24 }}>
          {rejected ? 'This account cannot access Weeez.' : 'Your account is waiting for approval. You can try again later.'}
        </Text>
        {!rejected && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={checkAgain} style={{ height: control.md, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
            {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={{ color: c.onPrimary, fontSize: fontSize.body, fontFamily: font.semibold }}>Check again</Text>}
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => signOutAndUnregister()} style={{ height: control.md, borderRadius: radius.full, borderWidth: 1, borderColor: c.divider, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
