import Svg, { Path, Circle, Rect } from 'react-native-svg';

type Shape =
  | ['p', string]
  | ['c', number, number, number]
  | ['r', number, number, number, number, number];

const p = (d: string): Shape => ['p', d];
const c = (cx: number, cy: number, r: number): Shape => ['c', cx, cy, r];
const r = (x: number, y: number, w: number, h: number, rx: number): Shape => ['r', x, y, w, h, rx];

const shapes = {
  archive: [p('M4 7h16v13H4z'), p('M3 4h18v3H3zm6 7h6')],
  arrowLeft: [p('m15 18-6-6 6-6'), p('M9 12h11')],
  bell: [p('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'), p('M10 21h4')],
  camera: [p('M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z'), c(12, 12.5, 3.5)],
  chat: [p('M20 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A8.5 8.5 0 1 1 20 15Z')],
  check: [p('m5 12 4 4L19 6')],
  chevron: [p('m9 18 6-6-6-6')],
  chevronDown: [p('m6 9 6 6 6-6')],
  clock: [c(12, 12, 9), p('M12 7v5l3 2')],
  close: [p('m6 6 12 12M18 6 6 18')],
  copy: [r(8, 8, 11, 12, 2), p('M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2')],
  doc: [p('M6 3h8l4 4v14H6z'), p('M14 3v5h5M9 13h6M9 17h5')],
  doubleCheck: [p('m3 12 4 4L14 7'), p('m10 15 2 2 9-10')],
  download: [p('M12 3v12m-4-4 4 4 4-4'), p('M5 20h14')],
  edit: [p('M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z'), p('m14.5 6.5 3 3')],
  emoji: [c(12, 12, 9), p('M8.5 10h.01M15.5 10h.01M8 14c1 2 2.5 3 4 3s3-1 4-3')],
  endCall: [p('M5 15c4-4 10-4 14 0l-2 4-4-2v-3h-2v3l-4 2z')],
  flipCamera: [r(3, 6, 18, 12, 2), p('M9 10a4 4 0 0 1 6 0l1-2M15 14a4 4 0 0 1-6 0l-1 2')],
  forward: [p('m14 7 5 5-5 5'), p('M19 12H9a5 5 0 0 0-5 5')],
  gallery: [r(3, 4, 18, 16, 2), c(9, 10, 2), p('m3 17 5-4 4 3 3-2 6 4')],
  eyeOff: [p('M3 3l18 18'), p('M10.6 6.1A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 7.7A17 17 0 0 0 2 12s3.5 6 10 6c1.5 0 2.9-.3 4.1-.8'), p('M9.9 9.9a3 3 0 0 0 4.2 4.2')],
  eye: [p('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'), c(12, 12, 3)],
  info: [c(12, 12, 9), p('M12 11v6m0-9h.01')],
  link: [p('m10 13 4-4'), p('M8 16H6a4 4 0 0 1 0-8h4m6 0h2a4 4 0 0 1 0 8h-4')],
  lock: [r(5, 10, 14, 11, 2), p('M8 10V7a4 4 0 0 1 8 0v3')],
  media: [r(3, 4, 18, 16, 2), p('m3 16 5-5 4 4 3-3 6 6')],
  mic: [r(9, 3, 6, 12, 3), p('M5 11a7 7 0 0 0 14 0m-7 7v3')],
  moon: [p('M20 15.5A9 9 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z')],
  more: [c(5, 12, 1), c(12, 12, 1), c(19, 12, 1)],
  mute: [p('M9 9v3a3 3 0 0 0 5 2M15 10V6a3 3 0 0 0-6 0'), p('M5 11a7 7 0 0 0 11 6M19 11a7 7 0 0 1-1 4M12 18v3M4 4l16 16')],
  pause: [r(6, 5, 4, 14, 1), r(14, 5, 4, 14, 1)],
  heart: [p('M12 20S4 15 4 9a4 4 0 0 1 7-2.7L12 8l1-1.7A4 4 0 0 1 20 9c0 6-8 11-8 11Z')],
  rings: [c(9, 12, 6), c(15, 12, 6)],
  repeat: [p('M17 3l4 4-4 4'), p('M3 11V9a2 2 0 0 1 2-2h16M7 21l-4-4 4-4'), p('M21 13v2a2 2 0 0 1-2 2H3')],
  plus: [p('M12 5v14M5 12h14')],
  flag: [p('M5 21V4m0 1h11l-2 4 2 4H5')],
  paperclip: [p('m20 11-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8')],
  phone: [p('M8 3 5 4.5C3 5.5 6 13 11 18s9 3 9.5 1l.5-3-5-2-2 2c-2-1-5-4-6-6l2-2z')],
  pin: [p('m14 4 6 6-3 1-4 4-1 5-2-5-5-2 4-4 1-3z'), p('m9 15-5 5')],
  play: [p('m9 7 9 5-9 5z')],
  readCheck: [p('m3 12 4 4L14 7'), p('m10 15 2 2 9-10')],
  refresh: [p('M20 7v5h-5'), p('M19 12a7 7 0 1 0-2 5')],
  reply: [p('m10 8-5 4 5 4'), p('M5 12h8a6 6 0 0 1 6 6')],
  search: [c(11, 11, 7), p('m16 16 5 5')],
  send: [p('m3 4 18 8-18 8 3-8z'), p('M6 12h15')],
  settings: [c(12, 12, 3), p('M19 14.5l2 1.5-2 3-2.5-1a8 8 0 0 1-2.5 1.5L13.5 22h-3L10 19.5A8 8 0 0 1 7.5 18L5 19l-2-3 2-1.5a8 8 0 0 1 0-3L3 10l2-3 2.5 1A8 8 0 0 1 10 6.5L10.5 4h3l.5 2.5A8 8 0 0 1 16.5 8L19 7l2 3-2 1.5a8 8 0 0 1 0 3Z')],
  speaker: [p('M5 10v4h4l5 4V6l-5 4z'), p('M17 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12')],
  star: [p('m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z')],
  sun: [c(12, 12, 4), p('M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  trash: [p('M5 7h14m-9-3h4l1 3M7 7l1 14h8l1-14M10 11v6m4-6v6')],
  user: [c(12, 8, 4), p('M4 21a8 8 0 0 1 16 0')],
  video: [r(3, 6, 13, 12, 2), p('m16 10 5-3v10l-5-3')],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof shapes;
export const iconNames = Object.keys(shapes) as IconName[];

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {shapes[name].map((s, i) =>
        s[0] === 'p' ? <Path key={i} d={s[1]} />
        : s[0] === 'c' ? <Circle key={i} cx={s[1]} cy={s[2]} r={s[3]} />
        : <Rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} />,
      )}
    </Svg>
  );
}
