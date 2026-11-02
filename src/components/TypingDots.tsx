import { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export function TypingDots() {
  const { c } = useTheme();
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0.45))).current;

  useEffect(() => {
    const nd = Platform.OS !== 'web';
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: nd }),
          Animated.timing(v, { toValue: 0.45, duration: 600, useNativeDriver: nd }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [vals]);

  return (
    <View
      accessibilityLabel="Typing"
      style={{
        alignSelf: 'flex-start',
        width: 54,
        height: 30,
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        borderRadius: 12,
        borderBottomLeftRadius: 4,
        backgroundColor: c.bubbleIncoming,
      }}
    >
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.textSecondary, opacity: v }} />
      ))}
    </View>
  );
}
