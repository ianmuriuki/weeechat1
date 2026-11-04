import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';
import { useWallpaper } from '../lib/wallpaper';

// How strong the doodles are. Raise these numbers to make them easier to see.
const OPACITY_LIGHT = 0.07;
const OPACITY_DARK = 0.06;

type Shape =
  | ['p', string]
  | ['c', number, number, number]
  | ['r', number, number, number, number, number];

const p = (d: string): Shape => ['p', d];
const c = (cx: number, cy: number, r: number): Shape => ['c', cx, cy, r];
const r = (x: number, y: number, w: number, h: number, rx: number): Shape => ['r', x, y, w, h, rx];

// Same construction as the icon set: 24 grid, 1.5 stroke, round caps and joins.
const DOODLES: Record<string, Shape[]> = {
  heart: [p('M12 20.5C6 16.5 3.5 13 3.5 9.5A4.5 4.5 0 0 1 12 7.5a4.5 4.5 0 0 1 8.5 2c0 3.5-2.5 7-8.5 11z')],
  rings: [c(9.5, 12, 4.5), c(14.5, 12, 4.5)],
  flower: [c(12, 6.8, 2.6), c(12, 17.2, 2.6), c(6.8, 12, 2.6), c(17.2, 12, 2.6), c(12, 12, 1.6)],
  moon: [p('M20 15.5A9 9 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z')],
  star: [p('m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z')],
  sparkle: [p('M12 3c.6 5.4 3.6 8.4 9 9-5.4.6-8.4 3.6-9 9-.6-5.4-3.6-8.4-9-9 5.4-.6 8.4-3.6 9-9z')],
  sun: [c(12, 12, 4), p('M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  cup: [p('M5 9h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z'), p('M17 10h1.5a2.5 2.5 0 0 1 0 5H17'), p('M9 3c0 1.5 1.5 1.5 1.5 3M13 3c0 1.5 1.5 1.5 1.5 3')],
  music: [p('M9 18V5l11-2v13'), c(6.5, 18, 2.5), c(17.5, 16, 2.5)],
  envelope: [r(3, 5, 18, 14, 2), p('m3 7 9 6 9-6')],
  plane: [p('m3 4 18 8-18 8 3-8z'), p('M6 12h15')],
  headphones: [p('M4 14v-2a8 8 0 0 1 16 0v2'), r(3, 14, 4, 6, 1.5), r(17, 14, 4, 6, 1.5)],
  camera: [p('M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'), c(12, 12.5, 3.5)],
  umbrella: [p('M3 12a9 9 0 0 1 18 0z'), p('M12 12v6a2 2 0 0 0 4 0')],
  iceCream: [p('M7 11l5 10 5-10'), p('M7 11a5 5 0 0 1 10 0z'), c(12, 4.4, 1.2)],
  cloud: [p('M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1A4.5 4.5 0 0 1 17.5 18z')],
  leaf: [p('M5 19c0-8 5-13 14-14 0 9-5 14-14 14z'), p('M5 19l7-7')],
  balloon: [p('M12 3a6 6 0 0 1 6 6c0 4-3.5 7-6 8.5C9.5 16 6 13 6 9a6 6 0 0 1 6-6z'), p('M12 17.5c0 1.8 1.4 2.4 1.4 4')],
  gift: [r(3, 9, 18, 12, 2), p('M12 9v12M3 14h18'), p('M12 9C9.5 9 8 6.5 9.5 5S12 6.5 12 9zm0 0c2.5 0 4-2.5 2.5-4S12 6.5 12 9z')],
};

// Six rows of six. No doodle sits next to its twin, also across the edges where the tile repeats.
const ORDER = [
  'heart', 'star', 'cup', 'sparkle', 'moon', 'plane',
  'sun', 'camera', 'star', 'flower', 'music', 'cloud',
  'sparkle', 'balloon', 'heart', 'umbrella', 'star', 'envelope',
  'gift', 'star', 'headphones', 'sparkle', 'rings', 'leaf',
  'iceCream', 'moon', 'sparkle', 'star', 'cup', 'heart',
  'cloud', 'flower', 'plane', 'sun', 'sparkle', 'star',
];

const TILE = 336;
const STEP = 56;
const COLS = 6;
const REACH = 24; // how far a doodle can stick out of the tile, so edges match when it repeats

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Placed = { key: string; shapes: Shape[]; transform: string };

// Built once. A doodle near an edge is drawn again on the opposite side so the pattern has no seams.
const PLACED: Placed[] = (() => {
  const rand = mulberry32(7);
  const out: Placed[] = [];
  ORDER.forEach((name, k) => {
    const row = Math.floor(k / COLS);
    const col = k % COLS;
    const x = (row % 2 ? 42 : 14) + STEP * col + (rand() - 0.5) * 12;
    const y = 28 + STEP * row + (rand() - 0.5) * 12;
    const rot = (rand() - 0.5) * 60;
    const scale = (22 + rand() * 5) / 24;
    for (const dx of [-TILE, 0, TILE]) {
      for (const dy of [-TILE, 0, TILE]) {
        const px = x + dx;
        const py = y + dy;
        if (px > -REACH && px < TILE + REACH && py > -REACH && py < TILE + REACH) {
          out.push({
            key: name + k + '_' + dx + '_' + dy,
            shapes: DOODLES[name],
            transform:
              'translate(' + px.toFixed(1) + ' ' + py.toFixed(1) + ') rotate(' + rot.toFixed(1) + ') scale(' + scale.toFixed(3) + ') translate(-12 -12)',
          });
        }
      }
    }
  });
  return out;
})();

export function DoodleLayer({ color, opacity, id }: { color: string; opacity: number; id: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
            <G stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={opacity}>
              {PLACED.map((d) => (
                <G key={d.key} transform={d.transform}>
                  {d.shapes.map((s, i) =>
                    s[0] === 'p' ? <Path key={i} d={s[1]} />
                    : s[0] === 'c' ? <Circle key={i} cx={s[1]} cy={s[2]} r={s[3]} />
                    : <Rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} />,
                  )}
                </G>
              ))}
            </G>
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={'url(#' + id + ')'} />
      </Svg>
    </View>
  );
}

export function ChatWallpaper() {
  const { c: col, isDark } = useTheme();
  const pref = useWallpaper();
  if (pref === 'plain') return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="weeez-doodles" patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
            <G stroke={col.text} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={isDark ? OPACITY_DARK : OPACITY_LIGHT}>
              {PLACED.map((d) => (
                <G key={d.key} transform={d.transform}>
                  {d.shapes.map((s, i) =>
                    s[0] === 'p' ? <Path key={i} d={s[1]} />
                    : s[0] === 'c' ? <Circle key={i} cx={s[1]} cy={s[2]} r={s[3]} />
                    : <Rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} />,
                  )}
                </G>
              ))}
            </G>
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#weeez-doodles)" />
      </Svg>
    </View>
  );
}
