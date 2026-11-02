import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { shade, useWeee, type Weee } from '../../theme/weee';

const ND = Platform.OS !== 'web';
export type Tone = 'card' | 'moss' | 'sun' | 'coral' | 'sky' | 'lilac' | 'rose' | 'mint' | 'deep';

// One card for the whole page: a gradient from a lighter to a darker stop, an optional glow,
// and a soft shadow tinted with the card's own color.
export function Card({
  tone, glow, onPress, label, style, pad = 20, radius = 28, children,
}: {
  tone: Tone;
  glow?: boolean;
  onPress?: () => void;
  label?: string;
  style?: ViewStyle;
  pad?: number;
  radius?: number;
  children: ReactNode;
}) {
  const { w, isDark } = useWeee();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const base = tone === 'card' ? w.card : w[tone as keyof Weee];
  const tint = tone === 'card' ? '#000000' : base;
  const lift: any =
    Platform.OS === 'web'
      ? { boxShadow: '0 14px 30px -10px ' + tint + (isDark ? '99' : tone === 'card' ? '26' : '66') }
      : { shadowColor: tint, shadowOpacity: isDark ? 0.5 : tone === 'card' ? 0.14 : 0.32, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 };

  const body = (
    <View onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height })); }} style={{ flexGrow: 1, borderRadius: radius, overflow: 'hidden', backgroundColor: base, padding: pad, borderWidth: tone === 'card' ? 1 : 0, borderColor: w.ink + (isDark ? '1f' : '14') }}>
      {tone !== 'card' && size.w > 0 && (
        <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }} width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={'g' + id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={shade(base, 0.14)} />
              <Stop offset="1" stopColor={shade(base, -0.14)} />
            </LinearGradient>
            <RadialGradient id={'r' + id} cx="0.9" cy="0" r="0.85">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.3} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill={'url(#g' + id + ')'} />
          {glow && <Rect x="0" y="0" width={size.w} height={size.h} fill={'url(#r' + id + ')'} />}
        </Svg>
      )}
      {children}
    </View>
  );

  const outer: ViewStyle = { flexGrow: 1, borderRadius: radius, ...style };
  if (!onPress) return <View style={[outer, lift]}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [outer, lift, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {body}
    </Pressable>
  );
}

// Fade and a 12 px rise on first show, staggered by 40 ms. Skipped when reduced motion is on.
export function Reveal({ index, style, children }: { index: number; style?: ViewStyle; children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    const go = (reduce: boolean) => {
      if (!alive) return;
      Animated.timing(v, { toValue: 1, duration: reduce ? 0 : 240, delay: reduce ? 0 : Math.min(index, 8) * 40, useNativeDriver: ND }).start();
    };
    AccessibilityInfo.isReduceMotionEnabled().then(go, () => go(true));
    return () => {
      alive = false;
    };
  }, [index, v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>{children}</Animated.View>;
}
