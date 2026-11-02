import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { font } from '../theme/type';

// The dashed circle with a number, the same mark WhatsApp uses for view once.
export function ViewBadge({
  value,
  size = 26,
  color,
  filled = false,
  textColor,
  dashed = true,
}: {
  value: number;
  size?: number;
  color: string;
  filled?: boolean;
  textColor?: string;
  dashed?: boolean;
}) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 1}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray={dashed && !filled ? '3.2 3.2' : undefined}
          fill={filled ? color : 'none'}
        />
      </Svg>
      <Text style={{ color: filled ? (textColor ?? color) : color, fontSize: size * 0.46, fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}
