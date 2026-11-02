import Svg, { Circle, Path } from 'react-native-svg';

// Two bubbles, tails pointing toward each other. Drawn on the same 24 grid as the app icon.
export function Logo({ size = 24, stroke, fill }: { size?: number; stroke: string; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={8.5} cy={10} r={5.5} stroke={stroke} fill="none" />
      <Path d="M11 14L13 17L13 13.5" stroke={stroke} />
      <Circle cx={15.5} cy={14} r={5.5} stroke={stroke} fill={fill} />
      <Path d="M13 10L11 7L11 10.5" stroke={stroke} />
    </Svg>
  );
}
