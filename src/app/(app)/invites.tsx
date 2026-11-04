import { useCallback, useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { Icon } from '../../lib/icons';
import { font } from '../../theme/type';
import { control, fontSize, radius, space } from '../../theme/tokens';

type Invite = { id: string; code: string; expires_at: string; used_by: string | null };

function groupedCode(code: string) {
  return code.match(/.{1,4}/g)?.join(' ') ?? code;
}

export default function Invites() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile, loading: sessionLoading } = useSession();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

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
    setNotice('');
    const { data, error } = await supabase.rpc('create_invite');
    setBusy(false);
    if (error) {
      setMessage(error.message.includes('invite limit') ? 'You have reached your invite limit.' : "Couldn't create an invite.");
      return;
    }
    setInvites((current) => [{ id: data as string, code: data as string, expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), used_by: null }, ...current]);
  }

  async function copyInvite(code: string) {
    try {
      await Clipboard.setStringAsync(code);
      setMessage('');
      setNotice('Invite code copied.');
    } catch {
      setMessage("Couldn't copy the invite code.");
      setNotice('');
    }
  }

  async function shareInvite(code: string) {
    try {
      const name = profile?.display_name.trim() || 'A friend';
      await Share.share({
        message: `Hi there, it's ${name}. I'd love you to join Weeez, a private place to chat and keep in touch with friends. Create your account with this invite code: ${code}. Once you're in, we can stay connected there.`,
      }, { dialogTitle: 'Share invite' });
    } catch {
      setMessage("Couldn't share the invite.");
      setNotice('');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[8], width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <View style={{ paddingHorizontal: space[5] }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: space[11], justifyContent: 'center' }}>
            <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Back</Text>
          </Pressable>
          <Text style={{ marginTop: space[6], color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold }}>Invite friends</Text>
          <Text style={{ marginTop: space[2], color: c.textSecondary, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular }}>Invite someone to Weeez. Each code works once and expires after 30 days.</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={createInvite}
          style={({ pressed }) => ({
            minHeight: control.md,
            marginTop: space[6],
            marginHorizontal: space[5],
            paddingHorizontal: space[4],
            borderRadius: radius.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: pressed ? c.hover : c.surfaceSubtle,
            opacity: busy ? 0.5 : 1,
          })}
        >
          <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Create invite</Text>
          {busy ? <ActivityIndicator color={c.primary} /> : <Icon name="plus" size={20} color={c.primary} />}
        </Pressable>

        <Text style={{ marginTop: space[8], marginBottom: space[2], paddingHorizontal: space[5], color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.semibold, letterSpacing: 0.7, textTransform: 'uppercase' }}>Your invite codes</Text>
        <View style={{ backgroundColor: c.surfaceSubtle }}>
          {loading ? (
            <View style={{ paddingHorizontal: space[5], paddingVertical: space[4], gap: space[2] }}>
              <View style={{ height: 22, width: '58%', borderRadius: radius.xs, backgroundColor: c.divider }} />
              <View style={{ height: 16, width: '28%', borderRadius: radius.xs, backgroundColor: c.divider }} />
            </View>
          ) : invites.length === 0 ? (
            <Text style={{ paddingHorizontal: space[5], paddingVertical: space[5], color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular }}>Create an invite when you are ready to bring someone into Weeez.</Text>
          ) : invites.map((invite, index) => (
            <View key={invite.id} style={{ paddingHorizontal: space[5], paddingVertical: space[4], borderBottomWidth: index === invites.length - 1 ? 0 : 1, borderBottomColor: c.divider }}>
              <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: 1.2 }}>{groupedCode(invite.code)}</Text>
              <Text style={{ marginTop: space[1], color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{invite.used_by ? 'Used' : 'Unused'}</Text>
              {!invite.used_by && (
                <View style={{ flexDirection: 'row', marginTop: space[2], gap: space[4] }}>
                  <Pressable accessibilityRole="button" onPress={() => copyInvite(invite.code)} style={{ minHeight: space[11], flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <Icon name="copy" size={18} color={c.primary} />
                    <Text style={{ color: c.primary, fontSize: fontSize.label, fontFamily: font.semibold }}>Copy</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => shareInvite(invite.code)} style={{ minHeight: space[11], flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                    <Icon name="forward" size={18} color={c.primary} />
                    <Text style={{ color: c.primary, fontSize: fontSize.label, fontFamily: font.semibold }}>Share</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
        {!!notice && <Text style={{ marginTop: space[3], paddingHorizontal: space[5], color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{notice}</Text>}
        {!!message && <Text style={{ marginTop: space[3], paddingHorizontal: space[5], color: c.danger, fontSize: fontSize.label, fontFamily: font.regular }}>{message}</Text>}
      </ScrollView>
    </View>
  );
}
