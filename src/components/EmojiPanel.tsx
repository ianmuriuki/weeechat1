import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';
import { space, fontSize } from '../theme/tokens';
import { font } from '../theme/type';

const KEY = 'weeez:recent-emoji';
const list = (s: string) => s.split(' ');

const CATS: { icon: string; items: string[] }[] = [
  { icon: '😀', items: list('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👹 👺 👻 👽 👾 🤖 🙈 🙉 🙊') },
  { icon: '👋', items: list('👋 🤚 🖐️ ✋ 🖖 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦵 🦶 👂 👃 🧠 👀 👁️ 👅 👄 💋') },
  { icon: '❤️', items: list('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 😻 💑 💏 🌹 🥀 🌷 🌸 💐 🎁 💌') },
  { icon: '🐶', items: list('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦉 🦇 🐺 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🐙 🦀 🐠 🐬 🐳 🦈 🐘 🦒 🦓 🐪 🐑 🐐 🌵 🌴 🌳 🍀 🍁 🌻 🌼') },
  { icon: '🍔', items: list('🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🥚 🍳 🥞 🥓 🍔 🍟 🍕 🌭 🌮 🌯 🍝 🍜 🍣 🍤 🍙 🍚 🍦 🍩 🍪 🎂 🍰 🍫 🍬 🍭 ☕ 🍵 🥤 🍺 🍷 🥂') },
  { icon: '⚽', items: list('⚽ 🏀 🏈 🎾 🎮 🎲 🎯 🎤 🎧 🎸 🎹 🎬 📷 📱 💻 🔋 💡 📚 ✏️ 🎉 🎊 🎈 🔥 ✨ ⭐ 🌟 💥 💫 💦 🌈 ☀️ 🌙 ⛅ ☔ ⚡ ❄️ 🚗 🚕 🚌 🏍️ ✈️ 🚀 🏠 🌍 🏖️ ⛰️ 💸 💯 ✅ ❌ ❓ ‼️ 🔔 🔒 🔑') },
];

export function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const { c } = useTheme();
  const [tab, setTab] = useState(1); // 0 is Recent
  const [recent, setRecent] = useState<string[]>([]);
  const [w, setW] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (!v) return;
        try {
          const arr = JSON.parse(v);
          if (Array.isArray(arr)) setRecent(arr.filter((x) => typeof x === 'string').slice(0, 24));
        } catch {
          // Ignore a damaged saved list.
        }
      })
      .catch(() => {});
  }, []);

  function pick(e: string) {
    onPick(e);
    setRecent((prev) => {
      const next = [e, ...prev.filter((x) => x !== e)].slice(0, 24);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  const data = tab === 0 ? recent : CATS[tab - 1].items;
  const cols = Math.max(6, Math.floor(w / 46));

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 300, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider }}>
      <View accessibilityRole="tablist" style={{ height: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.divider }}>
        {[null, ...CATS].map((cat, i) => (
          <Pressable
            key={i}
            accessibilityRole="tab"
            accessibilityLabel={i === 0 ? 'Recent emoji' : 'Emoji group ' + i}
            accessibilityState={{ selected: tab === i }}
            onPress={() => setTab(i)}
            style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: tab === i ? c.primary : 'transparent' }}
          >
            {cat ? <Text style={{ fontSize: 20, opacity: tab === i ? 1 : 0.6 }}>{cat.icon}</Text> : <Icon name="clock" size={20} color={tab === i ? c.primary : c.textSecondary} />}
          </Pressable>
        ))}
      </View>
      {data.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6] }}>
          <Text style={{ color: c.textSecondary, fontSize: fontSize.label, fontFamily: font.regular, textAlign: 'center' }}>Emoji you use will show up here.</Text>
        </View>
      ) : (
        <FlatList
          key={cols}
          data={data}
          numColumns={cols}
          keyExtractor={(e, i) => e + i}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={{ padding: space[2] }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Insert ' + item}
              onPress={() => pick(item)}
              style={({ pressed }) => ({ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: pressed ? c.hover : 'transparent' })}
            >
              <Text style={{ fontSize: 28 }}>{item}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
