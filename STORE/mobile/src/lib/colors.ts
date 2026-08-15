/**
 * Minimalist palette: pure white canvas, sharp black contours,
 * vibrant yellow as the sole accent. Strict two-tone — no grays.
 */
export const colors = {
  // Canvas
  background: '#FFFFFF',
  // Reserved for distinct sections (e.g. sticky bar) — never the body
  surface: '#F5F5F5',

  // Text
  text: '#000000',
  muted: '#000000', // muted text is rendered at a lower opacity, see textFaint
  textFaint: 'rgba(0,0,0,0.55)',
  textDisabled: 'rgba(0,0,0,0.30)',
  inverse: '#FFFFFF',

  // Lines
  border: '#000000',
  borderSoft: 'rgba(0,0,0,0.10)',
  borderFaint: 'rgba(0,0,0,0.06)',

  // Accent
  accent: '#FFDE4D', // vibrant yellow
  accentPressed: '#FEE715', // slightly brighter on press
  accentInk: '#000000', // text on top of yellow

  // Status — monochrome ink variants so chips stay minimal
  danger: '#000000',
  dangerBg: '#FFFFFF',
  success: '#000000',
  successBg: '#FFDE4D',

  // Press feedback
  pressed: 'rgba(0,0,0,0.06)',
} as const;

export type Color = keyof typeof colors;
