import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useSession } from '../../lib/session';
import { useWeeLink } from '../../lib/weeLink';
import { supabase } from '../../lib/supabase';
import { font } from '../../theme/type';
import { control, fontSize, radius, space } from '../../theme/tokens';

type Req = { link_id: string; requester_id: string; user_a_id: string; user_a_name: string | null; user_b_id: string; user_b_name: string | null };
type Active = { id: string; names: string };
type Account = { id: string; name: string; off: string[]; wee: boolean };

// Account switches: Wee is off until you switch it on. The others are on until you switch them off.
const ACCOUNT_FEATURES: [string, string][] = [['plans', 'Plans'], ['checkin', 'Check in'], ['workouts', 'Workouts'], ['habits', 'Habits']];
const FEATURES: [string, string][] = [
  ['days', 'Days count'], ['nudges', 'Nudges'], ['question', 'Question of the day'], ['week', 'Our week'],
  ['plans', 'Shared plans'], ['checkin', 'Check in'], ['workouts', 'Workouts'],
];

// Admin only: approve or decline Wee requests, end active links and switch features per link.
export default function WeeRequests() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile, loading: sessionLoading } = useSession();
  const { requests, reload } = useWeeLink();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [active, setActive] = useState<Active[]>([]);
  const [off, setOff] = useState<Record<string, string[]>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const r = await supabase.rpc('list_wee_requests');
    setReqs(r.error ? [] : ((r.data as Req[] | null) ?? []));
    const l = await supabase.from('wee_links').select('id, user_a, user_b').eq('status', 'active');
    const links = (l.data ?? []) as { id: string; user_a: string; user_b: string }[];
    const ids = Array.from(new Set(links.flatMap((x) => [x.user_a, x.user_b])));
    const names: Record<string, string> = {};
    const disabled: Record<string, string[]> = {};
    if (ids.length) {
      const p = await supabase.from('profiles').select('id, display_name').in('id', ids);
      for (const row of (p.data ?? []) as { id: string; display_name: string | null }[]) names[row.id] = row.display_name?.trim() || 'Someone';
      const f = await supabase.from('wee_link_features').select('link_id, feature, enabled').in('link_id', links.map((x) => x.id));
      for (const row of (f.data ?? []) as { link_id: string; feature: string; enabled: boolean }[]) {
        if (!row.enabled) disabled[row.link_id] = [...(disabled[row.link_id] ?? []), row.feature];
      }
    }
    const ppl = await supabase.from('profiles').select('id, display_name').eq('status', 'approved').order('display_name');
    const feats = await supabase.from('account_features').select('user_id, feature, enabled');
    const byUser: Record<string, { off: string[]; wee: boolean }> = {};
    for (const row of (feats.data ?? []) as { user_id: string; feature: string; enabled: boolean }[]) {
      const cur = byUser[row.user_id] ?? { off: [], wee: true };
      if (row.feature === 'wee') cur.wee = row.enabled;
      else if (!row.enabled) cur.off.push(row.feature);
      byUser[row.user_id] = cur;
    }
    setAccounts(((ppl.data ?? []) as { id: string; display_name: string | null }[]).map((x) => ({ id: x.id, name: x.display_name?.trim() || 'Someone', off: byUser[x.id]?.off ?? [], wee: byUser[x.id]?.wee ?? true })));
    setActive(links.map((x) => ({ id: x.id, names: (names[x.user_a] ?? 'Someone') + ' and ' + (names[x.user_b] ?? 'Someone') })));
    setOff(disabled);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.is_admin) void load();
  }, [load, profile?.is_admin, requests]);

  if (sessionLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!session || !profile?.is_admin) return <Redirect href="/settings" />;

  async function act(key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key);
    setMessage('');
    const { error } = await fn();
    setBusy(null);
    if (error) setMessage(error.message);
    await Promise.all([load(), reload()]);
  }

  async function toggle(linkId: string, feature: string, on: boolean) {
    setOff((o) => ({ ...o, [linkId]: on ? (o[linkId] ?? []).filter((x) => x !== feature) : [...(o[linkId] ?? []), feature] }));
    const { error } = await supabase.rpc('set_link_feature', { p_link: linkId, p_feature: feature, p_enabled: on });
    if (error) {
      setMessage(error.message);
      void load();
    }
  }

  async function toggleAccount(userId: string, feature: string, on: boolean) {
    setAccounts((l) => l.map((a) => (a.id !== userId ? a : feature === 'wee' ? { ...a, wee: on } : { ...a, off: on ? a.off.filter((x) => x !== feature) : [...a.off, feature] })));
    const { error } = await supabase.rpc('set_account_feature', { p_user: userId, p_feature: feature, p_enabled: on });
    if (error) {
      setMessage(error.message);
      void load();
    }
  }

  const pill = (label: string, onPress: () => void, key: string, danger?: boolean, ghost?: boolean) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy !== null}
      onPress={onPress}
      style={{ flex: 1, height: control.md, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: ghost ? 'transparent' : c.primary, borderWidth: ghost ? 1 : 0, borderColor: danger ? c.danger : c.divider, opacity: busy !== null ? 0.5 : 1 }}
    >
      {busy === key ? <ActivityIndicator color={ghost ? c.primary : c.onPrimary} /> : <Text style={{ color: ghost ? (danger ? c.danger : c.text) : c.onPrimary, fontSize: fontSize.label, fontFamily: font.semibold }}>{label}</Text>}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[8], paddingHorizontal: space[5], gap: space[4], width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: control.sm, justifyContent: 'center' }}>
          <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Back</Text>
        </Pressable>
        <Text style={{ color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold }}>Wee links</Text>

        <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.semibold }}>Waiting for you</Text>
        {loading ? <ActivityIndicator color={c.primary} /> : reqs.length === 0 ? (
          <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular }}>No requests right now.</Text>
        ) : reqs.map((r) => (
          <View key={r.link_id} style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSubtle, gap: space[3] }}>
            <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{(r.user_a_name?.trim() || 'Someone') + ' and ' + (r.user_b_name?.trim() || 'Someone')}</Text>
            <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>Both confirmed. Approve to open Wee for them.</Text>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              {pill('Approve', () => act('a' + r.link_id, () => supabase.rpc('decide_wee_link', { p_link: r.link_id, p_approve: true })), 'a' + r.link_id)}
              {pill('Decline', () => act('d' + r.link_id, () => supabase.rpc('decide_wee_link', { p_link: r.link_id, p_approve: false })), 'd' + r.link_id, true, true)}
            </View>
          </View>
        ))}

        <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.semibold, marginTop: space[3] }}>Active links</Text>
        {!loading && active.length === 0 && <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular }}>No active links.</Text>}
        {active.map((l) => (
          <View key={l.id} style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSubtle, gap: space[3] }}>
            <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{l.names}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {FEATURES.map(([key, label]) => {
                const on = !(off[l.id] ?? []).includes(key);
                return (
                  <Pressable key={key} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => toggle(l.id, key, !on)} style={{ minHeight: 36, paddingHorizontal: space[3], borderRadius: radius.full, justifyContent: 'center', backgroundColor: on ? c.primary : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.divider }}>
                    <Text style={{ color: on ? c.onPrimary : c.textSecondary, fontSize: fontSize.label, fontFamily: font.medium }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row' }}>{pill('End link', () => act('e' + l.id, () => supabase.rpc('end_wee_link', { p_link: l.id })), 'e' + l.id, true, true)}</View>
          </View>
        ))}
        <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.semibold, marginTop: space[3] }}>Accounts</Text>
        <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>Everything is on for everyone until you switch it off. Switching Wee off stops that account from requesting or joining a Wee.</Text>
        {accounts.map((a) => (
          <View key={a.id} style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSubtle, gap: space[3] }}>
            <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{a.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {[['wee', 'Wee', a.wee] as const, ...ACCOUNT_FEATURES.map(([key, label]) => [key, label, !a.off.includes(key)] as const)].map(([key, label, on]) => (
                <Pressable key={key} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => toggleAccount(a.id, key, !on)} style={{ minHeight: 36, paddingHorizontal: space[3], borderRadius: radius.full, justifyContent: 'center', backgroundColor: on ? c.primary : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.divider }}>
                  <Text style={{ color: on ? c.onPrimary : c.textSecondary, fontSize: fontSize.label, fontFamily: font.medium }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        {!!message && <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular }}>{message}</Text>}
      </ScrollView>
    </View>
  );
}
