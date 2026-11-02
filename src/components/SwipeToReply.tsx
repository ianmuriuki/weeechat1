import { useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../lib/icons';

const MAX = 64;
const TRIGGER = 48;

export function SwipeToReply({ children, enabled, onReply }: { children: ReactNode; enabled: boolean; onReply: () => void }) {
  const { c } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const live = useRef({ enabled, onReply });
  live.current = { enabled, onReply };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => live.current.enabled && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => x.setValue(Math.min(MAX, Math.max(0, g.dx) * 0.7)),
        onPanResponderRelease: (_e, g) => {
          if (Math.min(MAX, Math.max(0, g.dx) * 0.7) >= TRIGGER) live.current.onReply();
          Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 0 }).start(),
      }),
    [x],
  );

  const opacity = x.interpolate({ inputRange: [0, TRIGGER], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = x.interpolate({ inputRange: [0, TRIGGER], outputRange: [0.6, 1], extrapolate: 'clamp' });

  return (
    <View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 4, top: 0, bottom: 0, justifyContent: 'center', opacity, transform: [{ scale }] }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.overlaySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="reply" size={18} color={c.textSecondary} />
        </View>
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
