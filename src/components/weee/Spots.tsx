import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ART, shade, useWeee } from '../../theme/weee';

// Two figures stretching toward each other. Flat shapes, one soft shadow side each.
export function TwoFigures() {
  const { w } = useWeee();
  const a = w.rose;
  const b = w.sun;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="xMaxYMax meet" accessibilityLabel="Two people stretching toward each other">
      <Circle cx={100} cy={72} r={64} fill="#ffffff" opacity={0.1} />
      <Ellipse cx={100} cy={139} rx={82} ry={5} fill={ART.ground} />
      <Path d="M54 103 46 133M70 103l10 30" stroke={ART.hair} strokeWidth={9} strokeLinecap="round" />
      <Path d="M130 103l-9 30M146 103l10 30" stroke={ART.hair} strokeWidth={9} strokeLinecap="round" />
      <Ellipse cx={44} cy={135} rx={8} ry={4} fill={ART.shoe} />
      <Ellipse cx={82} cy={135} rx={8} ry={4} fill={ART.shoe} />
      <Ellipse cx={119} cy={135} rx={8} ry={4} fill={ART.shoe} />
      <Ellipse cx={158} cy={135} rx={8} ry={4} fill={ART.shoe} />
      <Path d="M46 60 27 80M80 58l19-24" stroke={ART.skinA} strokeWidth={8} strokeLinecap="round" />
      <Path d="M154 62l20 18M120 60l-19-26" stroke={ART.skinB} strokeWidth={8} strokeLinecap="round" />
      <Path d="M44 64c0-9 8-15 18-15s18 6 18 15l-3 40H47z" fill={a} />
      <Path d="M62 49c10 0 18 6 18 15l-3 40H62z" fill={shade(a, -0.16)} />
      <Path d="M120 66c0-9 8-15 18-15s18 6 18 15l-3 38h-30z" fill={b} />
      <Path d="M138 51c10 0 18 6 18 15l-3 38h-15z" fill={shade(b, -0.16)} />
      <Circle cx={62} cy={34} r={13} fill={ART.skinA} />
      <Path d="M49 33a13 13 0 0 1 26 0c-6-5-18-5-26 0z" fill={ART.hair} />
      <Circle cx={138} cy={36} r={13} fill={ART.skinB} />
      <Path d="M125 35a13 13 0 0 1 26 0c-6-5-18-5-26 0z" fill={ART.hair} />
    </Svg>
  );
}

export function CupsSpot({ size = 96 }: { size?: number }) {
  const { w } = useWeee();
  return (
    <Svg width={size} height={(size * 72) / 120} viewBox="0 0 120 72" fill="none" stroke={w.ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 31h34v24H16zM50 36h8a8 8 0 0 1 0 14h-8M68 31h34v24H68zM102 36h7a8 8 0 0 1 0 14h-7M28 25c-6-7 5-9 0-16M81 25c-6-7 5-9 0-16" />
    </Svg>
  );
}

export function HeartArt({ size = 88, fill = false }: { size?: number; fill?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="weeeHeart" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#ffd3de" />
        </LinearGradient>
      </Defs>
      <Path d="M12 21S3 15.2 3 8.8A4.8 4.8 0 0 1 11.2 5.4L12 6.6l.8-1.2A4.8 4.8 0 0 1 21 8.8C21 15.2 12 21 12 21Z" fill={fill ? '#ffffff' : 'url(#weeeHeart)'} />
      {!fill && <Path d="M6.4 8.4c.3-1.5 1.5-2.3 2.9-2.1" stroke="#ffffff" strokeWidth={1.1} strokeLinecap="round" fill="none" opacity={0.9} />}
      <Rect x="0" y="0" width="0" height="0" fill="none" />
    </Svg>
  );
}
