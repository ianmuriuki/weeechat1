import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Text } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';
import { useSession } from '../lib/session';
import { motion } from '../theme/tokens';
import { font } from '../theme/type';

const AnimatedCircle: any = Animated.createAnimatedComponent(Circle as any);
const AnimatedPath: any = Animated.createAnimatedComponent(Path as any);
const isWeb = Platform.OS === 'web';

// On phones the mark draws in over 600 ms. On web it fades in, because animated SVG parts
// pass props the browser does not accept. The splash fades away once the app is ready.
export function LaunchSplash() {
  const { c } = useTheme();
  const { loading } = useSession();
  const draw = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [drawn, setDrawn] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      let reduce = false;
      try {
        reduce = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        // Treat it as off.
      }
      if (reduce || isWeb) {
        draw.setValue(1);
        setTimeout(() => alive && setDrawn(true), 250);
        return;
      }
      Animated.timing(draw, { toValue: 1, duration: motion.launch, useNativeDriver: false }).start(() => alive && setTimeout(() => alive && setDrawn(true), 150));
    })();
    return () => {
      alive = false;
    };
  }, [draw]);

  useEffect(() => {
    if (!drawn || loading) return;
    Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: !isWeb }).start(() => setGone(true));
  }, [drawn, loading, fade]);

  if (gone) return null;

  const dash = draw.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const fill = draw.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1] });
  const word = draw.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });

  return (
    <Animated.View
      pointerEvents={drawn && !loading ? 'none' : 'auto'}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 100, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', gap: 16, opacity: fade }}
    >
      {isWeb ? (
        <Animated.View style={{ opacity: draw }}>
          <Svg width={112} height={112} viewBox="0 0 24 24" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={8.5} cy={10} r={5.5} stroke={c.primary} fill="none" />
            <Path d="M11 14L13 17L13 13.5" stroke={c.primary} />
            <Circle cx={15.5} cy={14} r={5.5} stroke={c.primary} fill={c.surface} />
            <Path d="M13 10L11 7L11 10.5" stroke={c.primary} />
          </Svg>
        </Animated.View>
      ) : (
        <Svg width={112} height={112} viewBox="0 0 24 24" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <AnimatedCircle cx={8.5} cy={10} r={5.5} stroke={c.primary} fill="none" strokeDasharray="40 40" strokeDashoffset={dash} />
          <AnimatedPath d="M11 14L13 17L13 13.5" stroke={c.primary} strokeDasharray="40 40" strokeDashoffset={dash} />
          <AnimatedCircle cx={15.5} cy={14} r={5.5} stroke={c.primary} fill={c.surface} fillOpacity={fill} strokeDasharray="40 40" strokeDashoffset={dash} />
          <AnimatedPath d="M13 10L11 7L11 10.5" stroke={c.primary} strokeDasharray="40 40" strokeDashoffset={dash} />
        </Svg>
      )}
      <Animated.View style={{ opacity: word }}>
        <Text style={{ color: c.primary, fontSize: 20, fontFamily: font.semibold, letterSpacing: -0.4 }}>Weeez</Text>
      </Animated.View>
    </Animated.View>
  );
}
