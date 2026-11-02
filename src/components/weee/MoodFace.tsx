import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { BLOCK_INK } from '../../theme/weee';

export type Mood = 'calm' | 'happy' | 'tired' | 'stressed' | 'loving' | 'hug';

// Pass fill for a colored face with a soft highlight. Without it the face is a pale outline.
export function MoodFace({ mood, size, color = BLOCK_INK, fill, dim }: { mood: Mood; size: number; color?: string; fill?: string; dim?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={dim ? 0.4 : 1}>
      <Circle cx={24} cy={24} r={21} fill={fill ?? 'rgba(255,255,255,0.48)'} />
      {fill && <Ellipse cx={17} cy={14} rx={9} ry={5} fill="#ffffff" opacity={0.38} stroke="none" transform="rotate(-25 17 14)" />}
      {mood === 'loving' ? (
        <>
          <Path d="M14 19c2-4 7-2 7 2 0 3-4 5-4 5s-4-2-4-5c0-1 0-2 1-2M28 19c2-4 7-2 7 2 0 3-4 5-4 5s-4-2-4-5c0-1 0-2 1-2" />
          <Path d="M17 31c4 4 10 4 14 0" />
        </>
      ) : (
        <>
          <Path d="M17 20h.01M31 20h.01" />
          {mood === 'happy' ? <Path d="M16 28c4 6 12 6 16 0" />
            : mood === 'tired' ? <Path d="M15 20h5m8 0h5M18 31h12" />
            : mood === 'stressed' ? <Path d="m15 18 6 3m12-3-6 3M18 32c4-4 8-4 12 0" />
            : mood === 'hug' ? (
              <>
                <Path d="M18 31c4-2 8-2 12 0" />
                <Path d="M8 27c4 0 6 4 9 7m23-7c-4 0-6 4-9 7" />
              </>
            ) : <Path d="M18 29h12" />}
        </>
      )}
    </Svg>
  );
}
