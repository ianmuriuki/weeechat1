import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, IconButton } from '../../../components/Primitives';
import { Icon } from '../../../lib/icons';
import { fetchProfiles, type Profile } from '../../../lib/chat';
import { getSignedUrl } from '../../../lib/media';
import { fetchShared, type SharedData } from '../../../lib/shared';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../../lib/session';
import { blockUser, clearConversationForEveryone, clearConversationOnDevice, removeFriend } from '../../../lib/conversationActions';
import { useTheme } from '../../../hooks/useTheme';
import { fontSize, radius, space } from '../../../theme/tokens';
import { font } from '../../../theme/type';

type Conversation = {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  avatar_path: string | null;
};

export default function ChatInfo() {
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [person, setPerson] = useState<Profile | null>(null);
  const [media, setMedia] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [action, setAction] = useState<'group' | 'clear' | 'confirm-clear' | 'confirm-block' | 'confirm-remove' | null>(null);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groups, setGroups] = useState<Array<{ id: string; title: string }>>([]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');
    try {
      const { data: conversationData, error: conversationError } = await supabase
        .from('conversations')
        .select('id, kind, title, avatar_path')
        .eq('id', conversationId)
        .single();
      if (conversationError) throw conversationError;
      const profiles = await fetchProfiles();
      const members = await supabase.from('conversation_members').select('user_id').eq('conversation_id', conversationId);
      if (members.error) throw members.error;
      const otherId = members.data?.find((member) => member.user_id !== session?.user.id)?.user_id;
      const nextPerson = profiles.find((profile) => profile.id === otherId) ?? null;
      const nextMedia = await fetchShared(conversationId);
      setConversation(conversationData as Conversation);
      setPerson(nextPerson);
      setMedia(nextMedia);
    } catch {
      setError("Couldn't load this chat info. Try again.");
    } finally {
      setLoading(false);
    }
  }, [conversationId, session?.user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!media) return;
    let active = true;
    const items = media.photos.slice(0, 4);
    Promise.all(items.map(async (item) => [item.media.id, await getSignedUrl(item.media.storage_path)] as const))
      .then((entries) => {
        if (active) setThumbnailUrls(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [media]);

  if (!conversationId) return null;

  const name = conversation?.kind === 'group' ? conversation.title ?? 'Group chat' : person?.display_name ?? 'Chat';
  const avatarPath = conversation?.kind === 'group' ? conversation.avatar_path : person?.avatar_path;
  const mediaCount = (media?.photos.length ?? 0) + (media?.docs.length ?? 0) + (media?.links.length ?? 0);
  const currentConversationId = conversationId ?? '';
  const section = (title: string, children: React.ReactNode) => (
    <View style={{ marginTop: space[6] }}>
      <Text style={{ paddingHorizontal: space[5], paddingBottom: space[2], color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.semibold, textTransform: 'uppercase', letterSpacing: 0.7 }}>{title}</Text>
      <View style={{ backgroundColor: c.surfaceSubtle }}>{children}</View>
    </View>
  );
  const row = (icon: 'user' | 'plus' | 'trash' | 'lock' | 'flag', label: string, onPress: () => void, danger = false) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ minHeight: 60, paddingHorizontal: space[5], flexDirection: 'row', alignItems: 'center', gap: space[4], borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: pressed ? c.hover : 'transparent' })}>
      <Icon name={icon} size={22} color={danger ? c.danger : c.textSecondary} />
      <Text style={{ color: danger ? c.danger : c.text, fontSize: fontSize.body, fontFamily: font.regular }}>{label}</Text>
    </Pressable>
  );

  async function openGroupActions() {
    setActionError('');
    if (!userId || !person) return;
    const membership = await supabase.from('conversation_members').select('conversation_id').eq('user_id', userId);
    if (membership.error) {
      setActionError("Couldn't load your groups. Try again.");
      setAction('group');
      return;
    }
    const ids = (membership.data ?? []).map((item) => item.conversation_id);
    const result = ids.length
      ? await supabase.from('conversations').select('id, title').in('id', ids).eq('kind', 'group').order('title')
      : { data: [], error: null };
    if (result.error) {
      setActionError("Couldn't load your groups. Try again.");
    } else {
      setGroups((result.data ?? []) as Array<{ id: string; title: string }>);
    }
    setAction('group');
  }

  async function createGroup() {
    if (!person || !groupTitle.trim()) return;
    setBusy(true);
    setActionError('');
    const { error: createError } = await supabase.rpc('create_group', { p_title: groupTitle.trim(), p_members: [person.id] });
    setBusy(false);
    if (createError) {
      setActionError("Couldn't create the group. Try again.");
      return;
    }
    setAction(null);
    setGroupTitle('');
  }

  async function addToGroup(groupId: string) {
    if (!person) return;
    setBusy(true);
    setActionError('');
    const { error: addError } = await supabase.rpc('add_group_member', { p_conversation: groupId, p_user: person.id });
    setBusy(false);
    if (addError) {
      setActionError(addError.message.includes('already a member') ? 'This friend is already in that group.' : "Couldn't add this friend. Try again.");
      return;
    }
    setAction(null);
  }

  async function runAction(kind: 'clear-device' | 'clear-everyone' | 'block' | 'remove') {
    setBusy(true);
    setActionError('');
    try {
      if (kind === 'clear-device') await clearConversationOnDevice(currentConversationId);
      if (kind === 'clear-everyone') await clearConversationForEveryone(currentConversationId);
      if (kind === 'block' && person) await blockUser(person.id);
      if (kind === 'remove' && person) await removeFriend(person.id);
      setAction(null);
      if (kind === 'block' || kind === 'remove') router.replace('/chat' as never);
      else if (kind === 'clear-everyone') router.back();
    } catch {
      setActionError("Couldn't complete that action. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + space[8] }}>
        <View style={{ height: 64, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.divider }}>
          <IconButton icon="arrowLeft" label="Back to chat" onPress={() => router.back()} />
          <Text style={{ flex: 1, color: c.text, fontSize: fontSize.title, fontFamily: font.semibold }}>Chat info</Text>
        </View>
        {loading ? (
          <View style={{ padding: space[6], gap: space[3] }}>
            <View style={{ alignSelf: 'center', width: 112, height: 112, borderRadius: 56, backgroundColor: c.surfaceSubtle }} />
            <View style={{ alignSelf: 'center', width: 160, height: 20, borderRadius: radius.sm, backgroundColor: c.surfaceSubtle }} />
            <View style={{ height: 70, borderRadius: radius.lg, backgroundColor: c.surfaceSubtle }} />
          </View>
        ) : error ? (
          <View style={{ alignItems: 'center', padding: space[8], gap: space[3] }}>
            <Icon name="lock" size={32} color={c.textSecondary} />
            <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>Chat info is unavailable</Text>
            <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={load} style={{ minHeight: 44, paddingHorizontal: space[5], borderRadius: radius.full, borderWidth: 1, borderColor: c.divider, justifyContent: 'center' }}>
              <Text style={{ color: c.primary, fontSize: fontSize.label, fontFamily: font.semibold }}>Try again</Text>
            </Pressable>
          </View>
        ) : conversation ? (
          <>
            <View style={{ alignItems: 'center', paddingTop: space[6], paddingBottom: space[5], gap: space[2] }}>
              <Avatar name={name} diameter={112} color={c.avatarIann} path={avatarPath} />
              <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold }}>{name}</Text>
              {person?.username && <Text style={{ color: c.textSecondary, fontSize: fontSize.body, fontFamily: font.regular }}>{'@' + person.username}</Text>}
              {!!person?.status_text && <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{person.status_text}</Text>}
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push(('/media?conversationId=' + conversationId) as never)} style={({ pressed }) => ({ marginHorizontal: space[4], padding: space[4], minHeight: 76, borderRadius: radius.lg, backgroundColor: pressed ? c.hover : c.surfaceSubtle })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ gap: 3 }}>
                  <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>Media, links and docs</Text>
                  <Text style={{ color: c.textSecondary, fontSize: fontSize.meta, fontFamily: font.regular }}>{mediaCount + ' shared items'}</Text>
                </View>
                <Icon name="chevron" size={18} color={c.textSecondary} />
              </View>
              {media && media.photos.length > 0 && (
                <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[3] }}>
                  {media.photos.slice(0, 4).map((item) => (
                    <Image key={item.messageId} source={{ uri: thumbnailUrls[item.media.id] }} style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.surface }} />
                  ))}
                </View>
              )}
            </Pressable>
            {conversation.kind === 'direct' && section('Actions', <>
              {row('plus', 'Add to group', () => void openGroupActions())}
              {row('trash', 'Clear chat', () => { setActionError(''); setAction('clear'); })}
            </>)}
            {conversation.kind === 'direct' && section('Contact', <>
              {row('flag', 'Remove friend', () => { setActionError(''); setAction('confirm-remove'); }, true)}
              {row('lock', 'Block contact', () => { setActionError(''); setAction('confirm-block'); }, true)}
            </>)}
          </>
        ) : null}
      </ScrollView>
      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => { if (!busy) setAction(null); }}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim }}>
          <View style={{ padding: space[5], paddingBottom: insets.bottom + space[5], gap: space[3], backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }}>
            {action === 'group' && <>
              <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold }}>Add to group</Text>
              <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>Create a new group or add this friend to an existing one.</Text>
              <TextInput value={groupTitle} onChangeText={setGroupTitle} placeholder="New group name" placeholderTextColor={c.textSecondary} style={{ minHeight: 48, paddingHorizontal: space[4], borderBottomWidth: 1, borderBottomColor: c.divider, color: c.text, fontSize: fontSize.body, fontFamily: font.regular }} />
              <Pressable accessibilityRole="button" disabled={busy || !groupTitle.trim()} onPress={() => void createGroup()} style={{ minHeight: 48, borderRadius: radius.md, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !groupTitle.trim() ? 0.5 : 1 }}>
                <Text style={{ color: c.onPrimary, fontSize: fontSize.label, fontFamily: font.semibold }}>Create group</Text>
              </Pressable>
              {groups.map((group) => (
                <Pressable key={group.id} accessibilityRole="button" disabled={busy} onPress={() => void addToGroup(group.id)} style={{ minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: c.divider }}>
                  <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.regular }}>{'Add to ' + group.title}</Text>
                </Pressable>
              ))}
            </>}
            {action === 'clear' && <>
              <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold }}>Clear chat</Text>
              <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>Choose whether to clear this chat only here or for everyone.</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runAction('clear-device')} style={{ minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: c.divider }}><Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.regular }}>Clear on this device</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAction('confirm-clear')} style={{ minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: c.divider }}><Text style={{ color: c.danger, fontSize: fontSize.body, fontFamily: font.regular }}>Clear for everyone</Text></Pressable>
            </>}
            {(action === 'confirm-clear' || action === 'confirm-block' || action === 'confirm-remove') && <>
              <Text style={{ color: c.text, fontSize: fontSize.title, fontFamily: font.semibold }}>{action === 'confirm-clear' ? 'Clear chat for everyone' : action === 'confirm-block' ? 'Block contact' : 'Remove friend'}</Text>
              <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{action === 'confirm-clear' ? 'This removes the message content for everyone in this conversation.' : action === 'confirm-block' ? 'You will no longer receive friend requests from this contact.' : 'This removes the friendship and keeps the conversation history.'}</Text>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void runAction(action === 'confirm-clear' ? 'clear-everyone' : action === 'confirm-block' ? 'block' : 'remove')} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: c.danger, fontSize: fontSize.body, fontFamily: font.semibold }}>Confirm</Text></Pressable>
            </>}
            {!!actionError && <Text style={{ color: c.danger, fontSize: fontSize.label, fontFamily: font.regular }}>{actionError}</Text>}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAction(null)} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.primary, fontSize: fontSize.body, fontFamily: font.semibold }}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
