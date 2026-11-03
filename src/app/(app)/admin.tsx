import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { signOutAndUnregister } from '../../lib/push';
import { font } from '../../theme/type';
import { control, fontSize, radius, space } from '../../theme/tokens';

type PendingAccount = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  invited_by_username: string | null;
  created_at: string;
};

export default function Admin() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useSession();
  const [accounts, setAccounts] = useState<PendingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_pending');
    setLoading(false);
    if (error) {
      setMessage("Couldn't load pending accounts.");
      return;
    }
    setAccounts((data as PendingAccount[]) ?? []);
  }, []);

  useEffect(() => {
    if (profile?.is_admin) void Promise.resolve().then(load);
  }, [load, profile?.is_admin]);

  if (!session || !profile?.is_admin) return <Redirect href="/settings" />;

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setBusyId(id);
    setMessage('');
    const { error } = await supabase.rpc('set_account_status', { p_user: id, p_status: status });
    setBusyId(null);
    if (error) {
      setMessage("Couldn't update that account.");
      return;
    }
    setAccounts((current) => current.filter((account) => account.id !== id));
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[8], paddingHorizontal: space[5], gap: space[4], width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: control.sm, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Back</Text>
        </Pressable>
        <Text style={{ color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold }}>Account approvals</Text>
        {loading ? <ActivityIndicator color={c.primary} /> : accounts.length === 0 ? <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular }}>No pending accounts.</Text> : accounts.map((account) => (
          <View key={account.id} style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSubtle, gap: space[2] }}>
            <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{account.display_name}</Text>
            <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{'@' + account.username}</Text>
            <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{account.email}</Text>
            {!!account.invited_by_username && <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{'Invited by @' + account.invited_by_username}</Text>}
            <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[2] }}>
              <Pressable accessibilityRole="button" disabled={busyId === account.id} onPress={() => setStatus(account.id, 'approved')} style={{ flex: 1, height: control.md, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: busyId === account.id ? 0.5 : 1 }}>
                <Text style={{ color: c.onPrimary, fontSize: fontSize.label, fontFamily: font.semibold }}>Approve</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busyId === account.id} onPress={() => setStatus(account.id, 'rejected')} style={{ flex: 1, height: control.md, borderRadius: radius.full, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center', opacity: busyId === account.id ? 0.5 : 1 }}>
                <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.semibold }}>Reject</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {!!message && <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular }}>{message}</Text>}
        <Pressable accessibilityRole="button" onPress={() => signOutAndUnregister()} style={{ minHeight: control.md, justifyContent: 'center' }}>
          <Text style={{ color: c.danger, fontSize: fontSize.body, fontFamily: font.semibold }}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
