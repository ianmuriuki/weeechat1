import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Primitives';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { control, fontSize, space } from '../../theme/tokens';
import { font } from '../../theme/type';

type Member = {
  id: string;
  username: string;
  display_name: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  last_seen_at: string | null;
  created_at: string;
};

function lastSeen(value: string | null) {
  if (!value) return 'Never seen';
  return 'Last seen ' + new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Members() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile, loading: sessionLoading } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase.rpc('list_members');
    setLoading(false);
    if (loadError) {
      setError("Couldn't load members. Try again.");
      return;
    }
    setMembers((data as Member[]) ?? []);
  }, []);

  useEffect(() => {
    if (profile?.is_admin) void load();
  }, [load, profile?.is_admin]);

  if (sessionLoading) {
    return <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  }
  if (!session || !profile?.is_admin) return <Redirect href="/settings" />;

  function confirmDisable(member: Member) {
    Alert.alert('Disable account', 'This signs the account out on every device and prevents access until it is approved again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disable', style: 'destructive', onPress: () => void disable(member) },
    ]);
  }

  async function disable(member: Member) {
    setBusyId(member.id);
    setError('');
    const { error: disableError } = await supabase.rpc('disable_account', { p_user: member.id });
    setBusyId(null);
    if (disableError) {
      setError("Couldn't disable that account. Try again.");
      return;
    }
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, status: 'rejected' } : item));
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[8], width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <View style={{ paddingHorizontal: space[5] }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: control.sm, justifyContent: 'center' }}>
            <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Back</Text>
          </Pressable>
          <Text style={{ marginTop: space[6], color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold }}>Members</Text>
          <Text style={{ marginTop: space[2], color: c.textSecondary, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular }}>Manage approved and pending accounts.</Text>
        </View>
        {loading ? (
          <View style={{ padding: space[5], gap: space[3] }}>{[0, 1, 2].map((item) => <View key={item} style={{ height: 72, backgroundColor: c.surfaceSubtle }} />)}</View>
        ) : error ? (
          <Text accessibilityRole="alert" style={{ marginTop: space[8], paddingHorizontal: space[5], color: c.danger, fontSize: fontSize.body, fontFamily: font.regular }}>{error}</Text>
        ) : members.length === 0 ? (
          <Text style={{ marginTop: space[8], paddingHorizontal: space[5], color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular }}>No members found.</Text>
        ) : (
          <View style={{ marginTop: space[6], backgroundColor: c.surfaceSubtle }}>
            {members.map((member) => {
              const isSelf = member.id === session.user.id;
              return (
                <View key={member.id} style={{ minHeight: 88, paddingHorizontal: space[5], paddingVertical: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderBottomColor: c.divider }}>
                  <Avatar name={member.display_name} color={c.avatarIann} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{member.display_name}</Text>
                    <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{'@' + member.username + ' · ' + member.status}</Text>
                    <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{lastSeen(member.last_seen_at)}</Text>
                  </View>
                  {!isSelf && member.status !== 'rejected' && (
                    <Pressable accessibilityRole="button" disabled={busyId === member.id} onPress={() => confirmDisable(member)} style={{ minHeight: control.sm, paddingHorizontal: space[3], justifyContent: 'center', opacity: busyId === member.id ? 0.5 : 1 }}>
                      <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.semibold }}>Disable</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
