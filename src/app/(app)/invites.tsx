import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { font } from '../../theme/type';
import { control, fontSize, radius, space } from '../../theme/tokens';

type Invite = { id: string; code: string; expires_at: string; used_by: string | null };

export default function Invites() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile, loading: sessionLoading } = useSession();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase.from('invites').select('id, code, expires_at, used_by').eq('created_by', session.user.id).order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      setMessage("Couldn't load invites.");
      return;
    }
    setInvites((data as Invite[]) ?? []);
  }, [session]);

  useEffect(() => {
    if (profile?.status === 'approved') void Promise.resolve().then(load);
  }, [load, profile?.status]);

  if (sessionLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!session || profile?.status !== 'approved') return <Redirect href="/settings" />;

  async function createInvite() {
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.rpc('create_invite');
    setBusy(false);
    if (error) {
      setMessage(error.message.includes('invite limit') ? 'You have reached your invite limit.' : "Couldn't create an invite.");
      return;
    }
    setInvites((current) => [{ id: data as string, code: data as string, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), used_by: null }, ...current]);
  }

  async function shareInvite(code: string) {
    await Share.share({ message: 'Join me on Weeez with this invite code: ' + code }, { dialogTitle: 'Share invite' });
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[8], paddingHorizontal: space[5], gap: space[4], width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: control.sm, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Back</Text>
        </Pressable>
        <Text style={{ color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold }}>Invite friends</Text>
        <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular }}>Each invite works once and expires after 30 days.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={createInvite} style={{ height: control.md, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
          {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={{ color: c.onPrimary, fontSize: fontSize.body, fontFamily: font.semibold }}>Create invite</Text>}
        </Pressable>
        {loading ? <ActivityIndicator color={c.primary} /> : invites.map((invite) => (
          <View key={invite.id} style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSubtle, gap: space[2] }}>
            <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: 1 }}>{invite.code}</Text>
            <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{invite.used_by ? 'Used' : 'Unused'}</Text>
            {!invite.used_by && <Pressable accessibilityRole="button" onPress={() => shareInvite(invite.code)} style={{ minHeight: control.sm, justifyContent: 'center' }}><Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Share code</Text></Pressable>}
          </View>
        ))}
        {!!message && <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular }}>{message}</Text>}
      </ScrollView>
    </View>
  );
}
