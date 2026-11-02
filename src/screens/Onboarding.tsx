import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { signOutAndUnregister } from '../lib/push';
import { Icon, type IconName } from '../lib/icons';
import { Logo } from '../components/Logo';
import { DoodleLayer } from '../components/ChatWallpaper';
import { StatusBarCover } from '../components/StatusBarCover';
import { ProfilePhoto } from '../components/ProfilePhoto';
import { PasswordField } from '../components/PasswordField';
import { font } from '../theme/type';
import { space, fontSize } from '../theme/tokens';

function Field({
  label, value, onChangeText, placeholder, secure, email, autoFocus, onSubmit, maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secure?: boolean;
  email?: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
  maxLength?: number;
}) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 18, gap: 8 }}>
      <Text style={{ color: c.text, fontSize: 12, fontFamily: font.semibold }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={c.textSecondary}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={email ? 'email-address' : 'default'}
        autoComplete={email ? 'email' : secure ? 'current-password' : 'off'}
        autoFocus={autoFocus}
        maxLength={maxLength}
        onSubmitEditing={onSubmit}
        style={{ height: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: focus ? c.primary : c.divider, backgroundColor: c.surface, color: c.text, fontFamily: font.regular, fontSize: fontSize.body }}
      />
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, busy, disabled }: { label: string; icon: IconName; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  const off = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => ({ height: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 26, backgroundColor: c.primary, opacity: off ? 0.4 : pressed ? 0.92 : 1 })}
    >
      {busy ? <ActivityIndicator color={c.onPrimary} /> : (
        <>
          <Text style={{ color: c.onPrimary, fontSize: fontSize.body, fontFamily: font.semibold }}>{label}</Text>
          <Icon name={icon} size={20} color={c.onPrimary} />
        </>
      )}
    </Pressable>
  );
}

function TextButton({ label, icon, onPress, center }: { label: string; icon?: IconName; onPress: () => void; center?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ alignSelf: center ? 'center' : 'flex-start', minHeight: 48, paddingHorizontal: space[3], flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon && <Icon name={icon} size={20} color={c.primary} />}
      <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>{label}</Text>
    </Pressable>
  );
}

export function Onboarding() {
  const { c, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { session, loading, needsProfile, refreshProfile } = useSession();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const wide = width >= 900;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.surface, justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (session && !needsProfile) return <Redirect href="/chat" />;

  const shown = session ? 2 : step;
  const artBg = isDark ? c.onboardingDark : c.bubbleOutgoing;
  const lockText = isDark ? c.text : c.onboardingText;
  const h1Size = wide ? Math.min(52, Math.max(32, width * 0.031)) : 34;

  function next() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setMsg('Enter a valid email.');
      return;
    }
    setMsg('');
    setStep(1);
  }

  async function signIn() {
    if (!password) {
      setMsg('Enter your password.');
      return;
    }
    setBusy(true);
    setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(/invalid login/i.test(error.message) ? "That email or password isn't right." : error.message);
  }

  async function saveProfile() {
    const uid = session?.user.id;
    if (!uid) return;
    if (!name.trim()) {
      setMsg('Enter your name.');
      return;
    }
    setBusy(true);
    setMsg('');
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), status_text: status.trim() }).eq('id', uid);
    if (error) {
      setBusy(false);
      setMsg("Couldn't save. Try again.");
      return;
    }
    await refreshProfile();
    setBusy(false);
  }

  const tileShadow: any = Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(17,27,33,0.16)' } : { elevation: 4 };
  const art = (
    <View style={{ flex: wide ? 1.1 : undefined, height: wide ? undefined : 250 + insets.top, paddingTop: wide ? space[10] : insets.top, paddingHorizontal: wide ? space[10] : 24, backgroundColor: artBg, overflow: 'hidden', alignItems: wide ? undefined : 'center', justifyContent: wide ? undefined : 'center' }}>
      <DoodleLayer color={c.primary} opacity={isDark ? 0.24 : 0.22} id="weeechat-art" />
      {wide && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 3 }}>
          <Logo size={28} stroke={c.primary} fill={c.surface} />
          <Text style={{ color: c.primary, fontSize: fontSize.title, fontFamily: font.semibold, letterSpacing: -0.4 }}>weeechat</Text>
        </View>
      )}
      <View style={wide ? { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 20 } : { alignItems: 'center', gap: 14, paddingBottom: 24 }}>
        <View style={[{ width: wide ? 110 : 84, height: wide ? 110 : 84, borderRadius: wide ? 34 : 26, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, tileShadow]}>
          <Logo size={wide ? 72 : 54} stroke={c.primary} fill={c.surface} />
        </View>
        <Text style={{ color: lockText, fontSize: wide ? 20 : 17, fontFamily: font.semibold }}>Just the two of you.</Text>
      </View>
    </View>
  );

  const form = (
    <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: wide ? 56 : 24, paddingTop: wide ? 48 : 30, paddingBottom: wide ? 48 : 44 + insets.bottom }}>
      <Text style={{ color: c.primary, fontSize: 13, fontFamily: font.semibold, letterSpacing: 1, marginBottom: wide ? 44 : 24, fontVariant: ['tabular-nums'] }}>
        {'0' + (shown + 1) + ' '}
        <Text style={{ color: c.textSecondary }}>/ 03</Text>
      </Text>

      {shown === 0 && (
        <>
          <Text style={{ color: c.text, fontSize: h1Size, fontFamily: font.semibold, letterSpacing: -1.8, lineHeight: h1Size * 1.08, marginBottom: 16 }}>weeechat</Text>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, lineHeight: 25.6, marginBottom: wide ? 32 : 24 }}>Just the two of you.</Text>
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" email autoFocus onSubmit={next} />
          {!!msg && <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular, marginBottom: 12 }}>{msg}</Text>}
          <PrimaryButton label="Continue" icon="chevron" onPress={next} />
          <Text style={{ marginTop: 16, color: c.textSecondary, fontSize: 10, fontFamily: font.regular, textAlign: 'center', lineHeight: 15 }}>Private by design. Only the two of you are here.</Text>
        </>
      )}

      {shown === 1 && (
        <>
          <TextButton label="Back" icon="arrowLeft" onPress={() => { setStep(0); setMsg(''); setPassword(''); }} />
          <Text style={{ color: c.text, fontSize: h1Size, fontFamily: font.semibold, letterSpacing: -1.8, lineHeight: h1Size * 1.08, marginBottom: 16 }}>Enter your password</Text>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, lineHeight: 25.6, marginBottom: wide ? 32 : 24 }}>{'Signing in as ' + email.trim() + '.'}</Text>
          <PasswordField label="Password" value={password} onChangeText={setPassword} autoFocus onSubmit={signIn} />
          {!!msg && <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular, marginBottom: 12 }}>{msg}</Text>}
          <PrimaryButton label="Sign in" icon="check" onPress={signIn} busy={busy} />
        </>
      )}

      {shown === 2 && (
        <>
          <Text style={{ color: c.text, fontSize: h1Size, fontFamily: font.semibold, letterSpacing: -1.8, lineHeight: h1Size * 1.08, marginBottom: 16 }}>Make it yours</Text>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, lineHeight: 25.6, marginBottom: wide ? 32 : 24 }}>Add your name, photo and a short status.</Text>
          <View style={{ marginBottom: 28 }}>
            {session && <ProfilePhoto name={name} path={avatar} userId={session.user.id} onChange={setAvatar} />}
          </View>
          <Field label="Your name" value={name} onChangeText={setName} maxLength={60} autoFocus />
          <Field label="Status" value={status} onChangeText={setStatus} maxLength={140} placeholder="tea first, then plans" onSubmit={saveProfile} />
          <View style={{ marginBottom: 22, padding: 12, flexDirection: 'row', gap: 12, borderRadius: 12, backgroundColor: c.surfaceSubtle }}>
            <Icon name="bell" color={c.primary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: c.text, fontSize: 12, fontFamily: font.semibold }}>Choose what we can use</Text>
              <Text style={{ color: c.textSecondary, fontSize: 11, fontFamily: font.regular }}>We ask before using notifications, camera or microphone.</Text>
            </View>
          </View>
          {!!msg && <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular, marginBottom: 12 }}>{msg}</Text>}
          <PrimaryButton label="Open weeechat" icon="chevron" onPress={saveProfile} busy={busy} />
          <TextButton label="Not you? Sign out" center onPress={() => signOutAndUnregister()} />
        </>
      )}
    </View>
  );

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: c.surface }}>
        {art}
        <ScrollView style={{ flex: 0.9 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          {form}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
      {art}
      <View style={{ marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: c.surface }}>{form}</View>
    </ScrollView>
    <StatusBarCover color={artBg} />
    </View>
  );
}
