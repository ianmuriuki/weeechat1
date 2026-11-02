import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';
import { IconButton } from './Primitives';
import { pickAvatarImage, uploadAvatar, useAvatarUrl, type PickedAvatar } from '../lib/avatar';
import { space, fontSize } from '../theme/tokens';
import { font } from '../theme/type';

const lift: any = Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(17,27,33,0.14)' } : { elevation: 3 };

export function ProfilePhoto({
  name, path, userId, onChange, size = 88,
}: {
  name: string;
  path: string | null;
  userId: string;
  onChange: (path: string) => void;
  size?: number;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const url = useAvatarUrl(path);
  const [picked, setPicked] = useState<PickedAvatar | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function choose() {
    setErr('');
    try {
      const a = await pickAvatarImage();
      if (a) setPicked(a);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't open your photos.");
    }
  }

  async function save() {
    if (!picked) return;
    setBusy(true);
    setErr('');
    try {
      const p = await uploadAvatar(userId, picked, path);
      onChange(p);
      setPicked(null);
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't save that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: size, height: size }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.white, fontSize: 28, fontFamily: font.semibold }}>{(name.trim().charAt(0) || '?').toUpperCase()}</Text>
          {url ? <Image source={{ uri: url, cacheKey: path ?? undefined }} style={{ position: 'absolute', width: size, height: size }} contentFit="cover" /> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add profile photo"
          onPress={choose}
          style={[{ position: 'absolute', right: -4, bottom: -4, width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, lift]}
        >
          <Icon name="camera" color={c.primary} />
        </Pressable>
      </View>
      {!picked && !!err && <Text style={{ color: c.danger, fontSize: fontSize.meta, fontFamily: font.regular, textAlign: 'center' }}>{err}</Text>}

      <Modal visible={!!picked} transparent animationType="fade" onRequestClose={() => { if (!busy) setPicked(null); }} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: c.nativeCanvas, paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[4], paddingHorizontal: space[4] }}>
          <View style={{ alignSelf: 'flex-start', marginLeft: -space[2] }}>
            <IconButton icon="close" label="Cancel" color={c.white} disabled={busy} onPress={() => setPicked(null)} />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[5] }}>
            <View style={{ width: 240, height: 240, borderRadius: 120, overflow: 'hidden', backgroundColor: c.white12 }}>
              {picked && <Image source={{ uri: picked.uri }} style={{ width: 240, height: 240 }} contentFit="cover" />}
            </View>
            <Text style={{ color: c.white70, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>This is how your photo will look.</Text>
            {!!err && <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>{err}</Text>}
          </View>
          <View style={{ gap: space[2] }}>
            <Pressable
              accessibilityRole="button"
              onPress={save}
              disabled={busy}
              style={({ pressed }) => ({ height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, opacity: busy ? 0.6 : pressed ? 0.92 : 1 })}
            >
              {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={{ color: c.onPrimary, fontSize: fontSize.body, fontFamily: font.semibold }}>Save photo</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setPicked(null); choose(); }} style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.white, fontSize: fontSize.body, fontFamily: font.medium, opacity: busy ? 0.5 : 1 }}>Choose another</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
