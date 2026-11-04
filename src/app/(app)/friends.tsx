import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Primitives';
import { Icon } from '../../lib/icons';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/session';
import { useTheme } from '../../hooks/useTheme';
import { control, fontSize, radius, space } from '../../theme/tokens';
import { font } from '../../theme/type';

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
};

type FriendProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  status_text: string;
};

export default function Friends() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id;
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FriendProfile>>({});
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [searchMessage, setSearchMessage] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    const { data, error: friendshipError } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order('updated_at', { ascending: false });
    if (friendshipError) {
      setLoading(false);
      setError("Couldn't load friends. Try again.");
      return;
    }
    const rows = (data as Friendship[]) ?? [];
    const ids = [...new Set(rows.map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id))];
    if (ids.length === 0) {
      setFriendships(rows);
      setProfiles({});
      setLoading(false);
      return;
    }
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_path, status_text')
      .in('id', ids);
    setLoading(false);
    if (profileError) {
      setError("Couldn't load friend profiles. Try again.");
      return;
    }
    setFriendships(rows);
    setProfiles(Object.fromEntries(((profileData as FriendProfile[]) ?? []).map((profile) => [profile.id, profile])));
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function search() {
    const value = username.trim().toLowerCase();
    if (!value) {
      setSearchMessage('Enter a username.');
      setResult(null);
      return;
    }
    setSearching(true);
    setSearchMessage('');
    setResult(null);
    const { data, error: searchError } = await supabase.rpc('find_user', { p_username: value });
    setSearching(false);
    if (searchError) {
      setSearchMessage("Couldn't search right now. Try again.");
      return;
    }
    const found = (data as FriendProfile[] | null)?.[0];
    setResult(found ?? null);
    if (!found) setSearchMessage('No approved account found with that username.');
  }

  async function sendRequest() {
    if (!result) return;
    setBusyId(result.id);
    setSearchMessage('');
    const { error: requestError } = await supabase.rpc('send_friend_request', { p_user: result.id });
    setBusyId(null);
    if (requestError) {
      setSearchMessage(requestError.message.includes('already exists') ? 'A request already exists for this account.' : "Couldn't send the request.");
      return;
    }
    setSearchMessage('Request sent.');
    setResult(null);
    setUsername('');
    await load();
  }

  async function respond(id: string, accept: boolean) {
    setBusyId(id);
    setError('');
    const { error: responseError } = await supabase.rpc('respond_friend_request', { p_request: id, p_accept: accept });
    setBusyId(null);
    if (responseError) {
      setError("Couldn't update that request. Try again.");
      return;
    }
    await load();
  }

  const incoming = friendships.filter((row) => row.status === 'pending' && row.addressee_id === userId);
  const outgoing = friendships.filter((row) => row.status === 'pending' && row.requester_id === userId);
  const accepted = friendships.filter((row) => row.status === 'accepted');
  const row = (friendship: Friendship, action?: React.ReactNode) => {
    const otherId = friendship.requester_id === userId ? friendship.addressee_id : friendship.requester_id;
    const person = profiles[otherId];
    if (!person) return null;
    return (
      <View key={friendship.id} style={{ minHeight: 72, paddingHorizontal: space[5], paddingVertical: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderBottomColor: c.divider }}>
        <Avatar name={person.display_name} color={c.avatarIann} path={person.avatar_path} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{person.display_name}</Text>
          <Text numberOfLines={1} style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{'@' + person.username}</Text>
        </View>
        {action}
      </View>
    );
  };
  const section = (title: string, children: React.ReactNode) => (
    <>
      <Text style={{ marginTop: space[8], marginBottom: space[2], paddingHorizontal: space[5], color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.semibold, letterSpacing: 0.7, textTransform: 'uppercase' }}>{title}</Text>
      <View style={{ backgroundColor: c.surfaceSubtle }}>{children}</View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[8], width: '100%', maxWidth: 600, alignSelf: 'center' }}>
        <View style={{ paddingHorizontal: space[5] }}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: space[11], justifyContent: 'center' }}>
            <Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Back</Text>
          </Pressable>
          <Text style={{ marginTop: space[6], color: c.text, fontSize: fontSize.pageTitle, fontFamily: font.semibold }}>Friends</Text>
          <Text style={{ marginTop: space[2], color: c.textSecondary, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular }}>Find someone by their exact username.</Text>
          <View style={{ marginTop: space[5], flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <TextInput
              accessibilityLabel="Username"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="@username"
              placeholderTextColor={c.textSecondary}
              value={username}
              onChangeText={setUsername}
              onSubmitEditing={search}
              style={{ flex: 1, height: control.md, paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: c.surfaceSubtle, color: c.text, fontFamily: font.regular, fontSize: fontSize.body }}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Search username" onPress={search} disabled={searching} style={{ width: control.md, height: control.md, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: searching ? 0.5 : 1 }}>
              {searching ? <ActivityIndicator color={c.onPrimary} /> : <Icon name="search" size={20} color={c.onPrimary} />}
            </Pressable>
          </View>
        </View>

        {!!searchMessage && <Text style={{ marginTop: space[3], paddingHorizontal: space[5], color: result ? c.primary : c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{searchMessage}</Text>}
        {result && (
          <View style={{ marginTop: space[3], marginHorizontal: space[5], padding: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3], borderRadius: radius.md, backgroundColor: c.surfaceSubtle }}>
            <Avatar name={result.display_name} color={c.avatarIann} path={result.avatar_path} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>{result.display_name}</Text>
              <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{'@' + result.username}</Text>
            </View>
            <Pressable accessibilityRole="button" disabled={busyId === result.id} onPress={sendRequest} style={{ minHeight: space[11], paddingHorizontal: space[3], borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: busyId === result.id ? 0.5 : 1 }}>
              <Text style={{ color: c.onPrimary, fontSize: fontSize.label, fontFamily: font.semibold }}>Add</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={{ marginTop: space[8], paddingHorizontal: space[5], gap: space[3] }}>
            {[0, 1, 2].map((item) => <View key={item} style={{ height: 56, borderRadius: radius.md, backgroundColor: c.surfaceSubtle }} />)}
          </View>
        ) : error ? (
          <Text style={{ marginTop: space[8], paddingHorizontal: space[5], color: c.danger, fontSize: fontSize.body, fontFamily: font.regular }}>{error}</Text>
        ) : (
          <>
            {incoming.length > 0 && section('Incoming requests', incoming.map((item) => row(item, <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => respond(item.id, false)} style={{ minHeight: space[11], paddingHorizontal: space[3], borderRadius: radius.full, borderWidth: 1, borderColor: c.divider, justifyContent: 'center', opacity: busyId === item.id ? 0.5 : 1 }}>
                <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.semibold }}>Decline</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => respond(item.id, true)} style={{ minHeight: space[11], paddingHorizontal: space[3], borderRadius: radius.full, backgroundColor: c.primary, justifyContent: 'center', opacity: busyId === item.id ? 0.5 : 1 }}>
                <Text style={{ color: c.onPrimary, fontSize: fontSize.label, fontFamily: font.semibold }}>Accept</Text>
              </Pressable>
            </View>)))}
            {outgoing.length > 0 && section('Sent requests', outgoing.map((item) => row(item, <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>Pending</Text>)))}
            {accepted.length > 0 && section('Your friends', accepted.map((item) => row(item)))}
            {incoming.length === 0 && outgoing.length === 0 && accepted.length === 0 && (
              <View style={{ alignItems: 'center', paddingHorizontal: space[5], paddingTop: space[10] }}>
                <Icon name="user" size={32} color={c.textSecondary} />
                <Text style={{ marginTop: space[3], color: c.text, fontSize: fontSize.title, fontFamily: font.semibold }}>No friends yet</Text>
                <Text style={{ marginTop: space[2], color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular, textAlign: 'center' }}>Search for someone by username to send a request.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
