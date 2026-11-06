import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../lib/session';
import { useChatWee, useWeeLink } from '../../lib/weeLink';
import { supabase } from '../../lib/supabase';
import { Avatar, IconButton } from '../Primitives';
import { font } from '../../theme/type';
import { control, fontSize, radius, space } from '../../theme/tokens';

type Person = { id: string; display_name: string | null; avatar_path: string | null };

// What a direct chat shows before Wee is open: ask the friend, answer a request, or wait for the admin.
export function WeeeGate({ conversationId }: { conversationId: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useSession();
  const { allowed, reload } = useWeeLink();
  const { link, reload: reloadLink } = useChatWee(conversationId);
  const uid = session?.user.id ?? '';
  const isAdmin = !!profile?.is_admin;
  const [person, setPerson] = useState<Person | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const m = await supabase.from('conversation_members').select('user_id').eq('conversation_id', conversationId);
      const other = ((m.data ?? []) as { user_id: string }[]).find((x) => x.user_id !== uid)?.user_id;
      if (!other) return;
      const p = await supabase.from('profiles').select('id, display_name, avatar_path').eq('id', other).maybeSingle();
      if (alive) setPerson((p.data as Person | null) ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [conversationId, uid]);

  async function run(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key);
    setMessage('');
    const { error } = await fn();
    setBusy(null);
    if (error) setMessage(error.message);
    await Promise.all([reload(), reloadLink()]);
  }

  const button = (label: string, onPress: () => void, ghost?: boolean) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy !== null}
      onPress={onPress}
      style={{ minHeight: control.md, paddingHorizontal: space[5], borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? 'transparent' : c.primary, borderWidth: ghost ? 1 : 0, borderColor: c.divider, opacity: busy !== null ? 0.5 : 1 }}
    >
      {busy === label ? <ActivityIndicator color={ghost ? c.primary : c.onPrimary} /> : <Text style={{ color: ghost ? c.text : c.onPrimary, fontSize: fontSize.label, fontFamily: font.semibold }}>{label}</Text>}
    </Pressable>
  );

  const name = person?.display_name?.trim() || link?.partner_name?.trim() || 'your friend';
  let title = '';
  let text = '';
  let actions: React.ReactNode = null;
  if (link && link.status === 'pending_partner' && link.requested_by !== uid) {
    title = name + ' wants to link with you';
    text = 'Wee is a private space for the two of you. If you accept, the admin still has to approve it before it opens.';
    actions = (
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {button('Accept', () => run('Accept', () => supabase.rpc('confirm_wee_link', { p_link: link.link_id, p_accept: true })))}
        {button('Decline', () => run('Decline', () => supabase.rpc('confirm_wee_link', { p_link: link.link_id, p_accept: false })), true)}
      </View>
    );
  } else if (link && link.status === 'pending_partner') {
    title = 'Waiting for ' + name + ' to confirm';
    text = 'They got a notification. Once they accept, the admin approves it.';
    actions = button('Cancel request', () => run('Cancel request', () => supabase.rpc('cancel_wee_link', { p_link: link.link_id })), true);
  } else if (link) {
    title = 'Waiting for the admin to approve';
    text = 'You and ' + name + ' both said yes. You will get a notification when Wee opens.';
    actions = link.requested_by === uid ? button('Cancel request', () => run('Cancel request', () => supabase.rpc('cancel_wee_link', { p_link: link.link_id })), true) : null;
  } else if (!allowed) {
    title = 'Wee is turned off for your account';
    text = 'Ask the admin to turn it back on.';
  } else {
    title = 'Link with ' + name;
    text = isAdmin ? 'As admin you can open Wee with this friend straight away.' : 'Send a request. ' + name + ' confirms, then the admin approves, and Wee opens for the two of you.';
    actions = person ? button(isAdmin ? 'Link now' : 'Send request', () => run(isAdmin ? 'Link now' : 'Send request', () => (isAdmin ? supabase.rpc('admin_create_wee_link', { p_user: person.id }) : supabase.rpc('request_wee_link', { p_user: person.id })))) : <ActivityIndicator color={c.primary} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ paddingTop: insets.top, height: 64 + insets.top, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.divider }}>
        <IconButton icon="arrowLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat' as never))} />
        <Text style={{ flex: 1, color: c.text, fontSize: fontSize.title, fontFamily: font.semibold }}>Wee</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[5], paddingBottom: insets.bottom + space[8], gap: space[4], width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[4] }}>
          <Avatar name={person?.display_name || '?'} diameter={96} color={c.avatarIann} path={person?.avatar_path} />
        </View>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold, textAlign: 'center' }}>{title}</Text>
        <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, textAlign: 'center' }}>{text}</Text>
        <View style={{ alignItems: 'center' }}>{actions}</View>
        {!!message && <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>{message}</Text>}
      </ScrollView>
    </View>
  );
}
