import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, IconButton } from '../../../components/Primitives';
import { Icon } from '../../../lib/icons';
import { fetchProfiles, type Profile } from '../../../lib/chat';
import { getSignedUrl } from '../../../lib/media';
import { fetchShared, type SharedData } from '../../../lib/shared';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../../lib/session';
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
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [person, setPerson] = useState<Profile | null>(null);
  const [media, setMedia] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

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
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
