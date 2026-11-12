import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { Icon, type IconName } from '../lib/icons';
import { MessageBubble } from './MessageBubble';
import { firstLink } from '../lib/links';
import type { Message } from '../lib/chat';
import type { MediaRow } from '../lib/media';
import { space, radius, fontSize, control } from '../theme/tokens';
import { font } from '../theme/type';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const lift: any = Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(17,27,33,0.18)' } : { elevation: 6 };

export function MessageMenu({
  message, media, mine, myEmoji, partnerName, onClose, onReact, onReply, onCopy, onCopyLink, onEdit, onDelete, onPin, pinned,
}: {
  message: Message | null;
  media?: MediaRow;
  mine: boolean;
  myEmoji?: string;
  partnerName: string;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onCopyLink: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin?: () => void;
  pinned?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [message?.id]);
  if (!message) return null;

  const sendable = !message.pending && !message.id.startsWith('local-');
  const colW = Math.min(width - 32, 360);
  const side = mine ? 'flex-end' : 'flex-start';

  const items: { key: string; label: string; icon?: IconName; glyph?: string; danger?: boolean; run: () => void }[] = [];
  if (sendable) items.push({ key: 'reply', label: 'Reply', icon: 'reply', run: onReply });
  if (sendable && onPin) items.push({ key: 'pin', label: pinned ? 'Unpin' : 'Pin', glyph: '📌', run: onPin });
  if (message.body && message.kind !== 'gif' && message.kind !== 'sticker') items.push({ key: 'copy', label: 'Copy', icon: 'copy', run: onCopy });
  if (message.body && firstLink(message.body)) items.push({ key: 'copylink', label: 'Copy link', icon: 'link', run: onCopyLink });
  if (mine && sendable && ['text', 'image', 'file'].includes(message.kind)) items.push({ key: 'edit', label: 'Edit', icon: 'edit', run: onEdit });
  if (mine && sendable) items.push({ key: 'delete', label: 'Delete', icon: 'trash', danger: true, run: () => setConfirm(true) });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <Pressable onPress={() => {}} style={{ width: colW, gap: space[2] }}>
          {sendable && (
            <View style={[{ alignSelf: side, flexDirection: 'row', padding: 6, gap: 2, borderRadius: radius.full, backgroundColor: c.surface }, lift]}>
              {EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={'React with ' + e}
                  onPress={() => onReact(e)}
                  style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: myEmoji === e ? c.hover : 'transparent' }}
                >
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ maxHeight: 260, overflow: 'hidden' }}>
            <MessageBubble message={message} media={media} mine={mine} firstOfGroup wide={false} bare onRetry={() => {}} onOpen={() => {}} />
          </View>

          {confirm ? (
            <View style={[{ alignSelf: side, width: 260, padding: space[4], gap: space[3], borderRadius: radius.lg, backgroundColor: c.surface }, lift]}>
              <Text style={{ color: c.text, fontSize: fontSize.body, fontFamily: font.semibold }}>Delete this message?</Text>
              <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular }}>{partnerName + ' will see that it was deleted.'}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space[2] }}>
                <Pressable accessibilityRole="button" onPress={onClose} style={{ height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full, justifyContent: 'center' }}>
                  <Text style={{ color: c.primary, fontSize: fontSize.label, fontFamily: font.semibold }}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={onDelete} style={{ height: control.sm, paddingHorizontal: space[4], borderRadius: radius.full, justifyContent: 'center', backgroundColor: c.danger }}>
                  <Text style={{ color: c.white, fontSize: fontSize.label, fontFamily: font.semibold }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            items.length > 0 && (
              <View style={[{ alignSelf: side, width: 220, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.surface }, lift]}>
                {items.map((it, i) => (
                  <Pressable
                    key={it.key}
                    accessibilityRole="button"
                    onPress={it.run}
                    style={({ pressed }) => ({ height: 52, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.divider, backgroundColor: pressed ? c.hover : 'transparent' })}
                  >
                    {it.icon ? <Icon name={it.icon} color={it.danger ? c.danger : c.textSecondary} /> : <Text style={{ width: 24, fontSize: 18, textAlign: 'center' }}>{it.glyph}</Text>}
                    <Text style={{ color: it.danger ? c.danger : c.text, fontSize: fontSize.body, fontFamily: font.regular }}>{it.label}</Text>
                  </Pressable>
                ))}
              </View>
            )
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
