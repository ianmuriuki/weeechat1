import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useTheme, type ThemePref } from '../../theme/ThemeProvider';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { signOutAndUnregister } from '../../lib/push';
import { WallpaperSetting } from '../../components/WallpaperSetting';
import { ProfilePhoto } from '../../components/ProfilePhoto';
import { StatusBarCover } from '../../components/StatusBarCover';
import { PasswordField } from '../../components/PasswordField';
import { Icon } from '../../lib/icons';
import { formatSize } from '../../components/MessageBubble';
import { space, radius, fontSize, control } from '../../theme/tokens';
import { font } from '../../theme/type';

const FREE_BYTES = 1024 * 1024 * 1024;
const themes: { key: ThemePref; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

type Usage = { bytes: number; photos: number; files: number; voice: number };

export default function Settings() {
  const { c, pref, setPref } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, profile } = useSession();
  const router = useRouter();
  const userId = session?.user.id;

  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [saved, setSaved] = useState({ name: '', status: '' });
  const [profileMsg, setProfileMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [oldPw, setOldPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [pwMsg, setPwMsg] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageError, setUsageError] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('profiles')
      .select('display_name, status_text, avatar_path')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setName(data.display_name);
        setStatus(data.status_text);
        setAvatarPath(data.avatar_path);
        setSaved({ name: data.display_name, status: data.status_text });
      });
  }, [userId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const u: Usage = { bytes: 0, photos: 0, files: 0, voice: 0 };
        for (let page = 0; page < 20; page++) {
          const { data, error } = await supabase.from('media').select('size_bytes, kind').range(page * 1000, page * 1000 + 999);
          if (error) throw error;
          for (const r of data ?? []) {
            u.bytes += Number(r.size_bytes);
            if (r.kind === 'image') u.photos++;
            else if (r.kind === 'audio') u.voice++;
            else u.files++;
          }
          if (!data || data.length < 1000) break;
        }
        if (alive) setUsage(u);
      } catch {
        if (alive) setUsageError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Ask the server for the real email, and leave cleanly if the session is no longer valid.
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      if (error) {
        if (error.status === 401 || error.status === 403 || /session missing|invalid jwt|sub claim/i.test(error.message)) supabase.auth.signOut();
        return;
      }
      setEmail(data.user?.email ?? '');
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const dirty = name.trim() !== saved.name || status.trim() !== saved.status;

  async function saveProfile() {
    if (!userId) return;
    if (!name.trim()) {
      setProfileMsg('Enter your name.');
      return;
    }
    setBusy(true);
    setProfileMsg('');
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), status_text: status.trim() }).eq('id', userId);
    setBusy(false);
    if (error) {
      setProfileMsg("Couldn't save. Try again.");
      return;
    }
    setSaved({ name: name.trim(), status: status.trim() });
    setProfileMsg('Saved. Approved connections will see it next time they open the app.');
  }

  async function changePassword() {
    if (!oldPw) {
      setPwMsg('Enter your current password.');
      return;
    }
    if (pw.length < 8) {
      setPwMsg('Use at least 8 characters for the new password.');
      return;
    }
    if (pw !== pw2) {
      setPwMsg("The new passwords don't match.");
      return;
    }
    if (pw === oldPw) {
      setPwMsg('Choose a password you have not used here.');
      return;
    }
    if (!email) {
      setPwMsg("Couldn't read your email. Sign in again.");
      return;
    }
    setBusy(true);
    setPwMsg('');
    // Signing in with the current password proves it is right and also gives a fresh session.
    const signedIn = await supabase.auth.signInWithPassword({ email, password: oldPw });
    if (signedIn.error) {
      setBusy(false);
      setPwMsg(/invalid login/i.test(signedIn.error.message) ? "Your current password isn't right." : signedIn.error.message);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setPwMsg(error.message);
      return;
    }
    setOldPw('');
    setPw('');
    setPw2('');
    setPwOpen(false);
    setPwMsg('Password updated.');
  }

  const label = { color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.semibold, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: space[8], marginBottom: space[2] } as const;
  const input = { height: control.md, paddingHorizontal: space[4], borderRadius: radius.xl, borderWidth: 1, borderColor: c.divider, backgroundColor: c.surface, color: c.text, fontFamily: font.regular, fontSize: fontSize.body } as const;
  const note = { color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular, marginTop: space[2] } as const;
  const primaryBtn = (disabled: boolean) => ({ height: control.md, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1, marginTop: space[3] }) as const;
  const used = usage ? Math.min(1, usage.bytes / FREE_BYTES) : 0;
  const actionCard = (icon: 'user' | 'plus', title: string, description: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 72,
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        borderRadius: radius.lg,
        marginBottom: space[2],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: pressed ? c.hover : c.surfaceSubtle,
      })}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bubbleOutgoing }}>
        <Icon name={icon} size={18} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{title}</Text>
        <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{description}</Text>
      </View>
      <Icon name="chevron" size={18} color={c.textSecondary} />
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: c.surface }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + 120, paddingHorizontal: space[5], width: '100%', maxWidth: 560, alignSelf: 'center' }}
    >
      <Text style={{ color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold, letterSpacing: -0.7 }}>Settings</Text>

      <Text style={label}>Profile</Text>
      {userId && (
        <View style={{ alignItems: 'center', marginBottom: space[4] }}>
          <ProfilePhoto name={name} path={avatarPath} userId={userId} onChange={setAvatarPath} />
        </View>
      )}
      <TextInput accessibilityLabel="Name" placeholder="Name" placeholderTextColor={c.textSecondary} value={name} onChangeText={setName} maxLength={60} style={input} />
      <TextInput accessibilityLabel="Status" placeholder="Status" placeholderTextColor={c.textSecondary} value={status} onChangeText={setStatus} maxLength={140} style={[input, { marginTop: space[2] }]} />
      <Pressable accessibilityRole="button" disabled={!dirty || busy} onPress={saveProfile} style={primaryBtn(!dirty || busy)}>
        {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={{ color: c.onPrimary, fontSize: fontSize.body, fontFamily: font.semibold }}>Save</Text>}
      </Pressable>
      {!!profileMsg && <Text style={note}>{profileMsg}</Text>}

      {profile?.is_admin && (
        <>
          <Text style={label}>Administration</Text>
          {actionCard('user', 'Account approvals', 'Review people waiting to join Weeez.', () => router.push('/admin' as never))}
        </>
      )}
      <Text style={label}>Connections</Text>
      {actionCard('user', 'Friends', 'Find people and manage requests.', () => router.push('/friends' as never))}
      {actionCard('plus', 'Invite friends', 'Create and share an invite code.', () => router.push('/invites' as never))}

      <Text style={label}>Theme</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', padding: space[1], backgroundColor: c.surfaceSubtle, borderRadius: radius.md }}>
        {themes.map((o) => {
          const on = pref === o.key;
          return (
            <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setPref(o.key)} style={{ flex: 1, height: control.sm, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface : 'transparent' }}>
              <Text style={{ color: on ? c.primary : c.textSecondary, fontSize: fontSize.label, fontFamily: font.semibold }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <WallpaperSetting />

      <Text style={label}>Storage</Text>
      <View style={{ padding: space[4], borderRadius: radius.lg, backgroundColor: c.surfaceSubtle }}>
        {usage ? (
          <>
            <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{formatSize(usage.bytes) + ' of 1 GB used'}</Text>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.divider, marginTop: space[2], overflow: 'hidden' }}>
              <View style={{ width: Math.max(2, used * 100) + '%', height: 8, borderRadius: 4, backgroundColor: used > 0.85 ? c.danger : c.primary }} />
            </View>
            <Text style={note}>{usage.photos + ' photos, ' + usage.files + ' files, ' + usage.voice + ' voice messages'}</Text>
          </>
        ) : usageError ? (
          <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>Could not load usage.</Text>
        ) : (
          <ActivityIndicator color={c.primary} />
        )}
      </View>

      <Text style={label}>Account</Text>
      <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.regular }}>{email}</Text>
      <Pressable accessibilityRole="button" onPress={() => { setPwOpen((o) => !o); setPwMsg(''); }} style={{ height: control.md, justifyContent: 'center' }}>
        <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.medium }}>{pwOpen ? 'Cancel password change' : 'Change password'}</Text>
      </Pressable>
      {pwOpen && (
        <View style={{ gap: space[2] }}>
          <PasswordField pill placeholder="Current password" value={oldPw} onChangeText={setOldPw} />
          <PasswordField pill placeholder="New password, 8 or more characters" value={pw} onChangeText={setPw} />
          <PasswordField pill placeholder="Confirm new password" value={pw2} onChangeText={setPw2} onSubmit={changePassword} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={changePassword} style={primaryBtn(busy)}>
            {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={{ color: c.onPrimary, fontSize: fontSize.body, fontFamily: font.semibold }}>Update password</Text>}
          </Pressable>
        </View>
      )}
      {!!pwMsg && <Text style={note}>{pwMsg}</Text>}
      <Pressable
        accessibilityRole="button"
        onPress={() => signOutAndUnregister()}
        style={({ pressed }) => ({ marginTop: space[4], height: control.md, borderRadius: radius.full, borderWidth: 1, borderColor: c.divider, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.hover : 'transparent' })}
      >
        <Text style={{ color: c.danger, fontSize: fontSize.body, fontFamily: font.medium }}>Sign out</Text>
      </Pressable>

      <Text style={label}>About</Text>
      <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>Weeez</Text>
      <Text style={note}>{'Version ' + (Constants.expoConfig?.version ?? '1.0.0')}</Text>
      <Text style={note}>Only approved members can open this chat. Messages are protected in transit, and the Supabase project administrator can read them in the database.</Text>
    </ScrollView>
    <StatusBarCover />
    </View>
  );
}
