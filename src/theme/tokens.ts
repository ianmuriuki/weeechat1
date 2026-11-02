const lightColors = {
  primary: '#008069',
  accent: '#25d366',
  appbar: '#ffffff',
  chatCanvas: '#efeae2',
  bubbleOutgoing: '#d9fdd3',
  bubbleIncoming: '#ffffff',
  text: '#111b21',
  textSecondary: '#667781',
  divider: '#e9edef',
  read: '#53bdeb',
  danger: '#d90035',
  surface: '#ffffff',
  surfaceSubtle: '#f7f8fa',
  hover: '#f0f2f3',
  focus: '#006b58',
  onPrimary: '#ffffff',
  onAccent: '#062d25',
  avatarIann: '#8b5d49',
  avatarReminder: '#7258a7',
  warningSurface: '#fff3c8',
  warningText: '#574c28',
  callSurface: '#102e2a',
  callControls: 'rgba(5,15,18,0.82)',
  callSelfView: '#6d8a7b',
  file: '#c74444',
  reaction: '#c83855',
  scrim: 'rgba(5,12,15,0.46)',
  overlaySoft: 'rgba(0,0,0,0.055)',
  overlayMedia: 'rgba(0,0,0,0.68)',
  white: '#ffffff',
  white12: 'rgba(255,255,255,0.12)',
  white14: 'rgba(255,255,255,0.14)',
  white30: 'rgba(255,255,255,0.3)',
  white70: 'rgba(255,255,255,0.7)',
  black48: 'rgba(0,0,0,0.48)',
  black64: 'rgba(0,0,0,0.64)',
  shadowHairline: 'rgba(17,27,33,0.08)',
  onboardingText: '#064c3e',
  onboardingDark: '#073c34',
  highContrastDivider: '#727c81',
  keyboard: '#d1d5db',
  key: '#ffffff',
  nativeCanvas: '#0b141a',
  attachmentDocument: '#665cac',
  attachmentCamera: '#c94c69',
  attachmentGallery: '#82509e',
  attachmentAudio: '#c9742f',
  attachmentLocation: '#23845a',
  attachmentContact: '#2f76b2',
  link: '#0b57d0',
};

export type Colors = { [K in keyof typeof lightColors]: string };

const darkOverrides: Partial<Colors> = {
  primary: '#00a884',
  accent: '#00a884',
  appbar: '#202c33',
  chatCanvas: '#0b141a',
  bubbleOutgoing: '#005c4b',
  bubbleIncoming: '#202c33',
  text: '#e9edef',
  textSecondary: '#a9b5bb',
  divider: '#334149',
  surface: '#111b21',
  surfaceSubtle: '#202c33',
  hover: '#29373f',
  focus: '#25d366',
  warningSurface: '#2d2a1c',
  warningText: '#f5e8b7',
  keyboard: '#1f292f',
  key: '#35434b',
  link: '#a8c7fa',
};

export const colors: { light: Colors; dark: Colors } = {
  light: lightColors,
  dark: { ...lightColors, ...darkOverrides },
};

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32,
  10: 40, 11: 44, 12: 48, 14: 56, 16: 64, 18: 72, 20: 80, 24: 96,
} as const;

export const radius = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, full: 999,
  bubble: 12, tail: 4,
} as const;

export const fontSize = {
  caption: 11, meta: 12, label: 14, message: 15.5,
  body: 16, title: 20, pageTitle: 28, display: 52,
} as const;

export const lineHeight = {
  tight: 1.1, body: 1.5, message: 1.35,
} as const;

export const control = { sm: 40, md: 48, avatarMd: 52 } as const;

export const layout = {
  sidebarWidth: 400,
  infoWidth: 320,
  iosFrame: { width: 390, height: 844 },
  androidFrame: { width: 360, height: 800 },
} as const;

export const motion = { fast: 120, small: 200, page: 250, launch: 600, breathe: 3000 } as const;

export const size = { fab: 56, iconVisual: 40, hairline: 1, focus: 2, stroke: 1.5 } as const;
