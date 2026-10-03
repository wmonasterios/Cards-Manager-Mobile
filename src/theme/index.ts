// Poquet design-system tokens — the unified redesign: "Neón" for dark mode,
// "Confeti" (warm paper + vivid accents) for light mode. Both modes share the
// same vivid categorical palette (cards, categories, chart series), so a card
// or a category looks the same whichever mode is on.
export type ColorTokens = typeof darkColors;

// Shared vivid palette. Every fill here takes dark ink (#121212) except violet.
export const VIVID = {
  coral: '#FF5A47',
  violet: '#9F4FFF',
  honey: '#FFBB26',
  sky: '#64C6FF',
  pink: '#FF58AE',
  green: '#00C978',
  sun: '#FFCD6C',
  lavender: '#C9A3FF',
  grey: '#8A8FA8',
};

export const darkColors = {
  bg: '#0B0E1C',
  surface: '#141A30',
  surface2: '#10162B',
  ink: '#F4F5FA',
  ink2: '#C9CCDA',
  ink3: '#9AA0B8',
  ink2b: '#DCDFEA',
  line: '#2A3356',
  line2: '#1B2240',
  tint: '#1F2650',
  tint2: '#C8FF4D',
  accentLine: '#C8FF4D',
  // Text never uses the lime accent — lime is reserved for controls
  // (solid buttons, toggles, selected chips, active tab, progress).
  accentInk: '#F4F5FA',
  accentInk2: '#F4F5FA',
  onTint2: '#0A0E1F',
  accent: '#C8FF4D',
  bar: '#C8FF4D',
  tintInk2: '#C9CCDA',
  tintInk3: '#C9CCDA',
  tintInk: '#0A0E1F',
  onArt: '#F4F5FA',
  hair: 'rgba(244,245,250,0.08)',
  hair2: 'rgba(244,245,250,0.1)',
  hair3: 'rgba(244,245,250,0.12)',
  hair4: 'rgba(244,245,250,0.16)',
  hair5: 'rgba(244,245,250,0.18)',
  // Chart series, by rank. seg1 doubles as "urgent/late" and seg3 as "soon"
  // in the Home status rings and health bar (see status.ts): violet and honey.
  seg1: VIVID.violet,
  seg2: VIVID.pink,
  seg3: VIVID.honey,
  seg4: VIVID.sky,
  seg5: VIVID.coral,
  seg6: VIVID.green,
  seg7: VIVID.grey,
  // Category icon tiles: vivid fills with dark ink, in both modes.
  catBg: [VIVID.sun, VIVID.sky, VIVID.pink, VIVID.lavender, VIVID.green, '#FF8A65'] as string[],
  catInk: '#121212',
};

export const lightColors: ColorTokens = {
  bg: '#FBFAF9',
  surface: '#FFFFFF',
  surface2: '#F6F4EF',
  ink: '#121212',
  ink2: '#474645',
  ink3: '#6F6E6C',
  ink2b: '#343433',
  line: '#E2DDD5',
  line2: '#F2F0ED',
  tint: '#FFF1D6',
  tint2: '#121212',
  accentLine: '#121212',
  accentInk: '#121212',
  accentInk2: '#C93200',
  onTint2: '#FBFAF9',
  accent: '#121212',
  bar: '#121212',
  tintInk2: '#343433',
  tintInk3: '#343433',
  tintInk: '#FBFAF9',
  onArt: '#FFFFFF',
  hair: 'rgba(18,18,18,0.06)',
  hair2: 'rgba(18,18,18,0.08)',
  hair3: 'rgba(18,18,18,0.1)',
  hair4: 'rgba(18,18,18,0.14)',
  hair5: 'rgba(18,18,18,0.18)',
  seg1: VIVID.violet,
  seg2: VIVID.pink,
  seg3: VIVID.honey,
  seg4: VIVID.sky,
  seg5: VIVID.coral,
  seg6: VIVID.green,
  seg7: VIVID.grey,
  catBg: [VIVID.sun, VIVID.sky, VIVID.pink, VIVID.lavender, VIVID.green, '#FF8A65'],
  catInk: '#121212',
};

// Default export kept for call sites that only ever run in dark mode (rare).
export const colors = darkColors;

const CATEGORY_ICONS: Record<string, string> = {
  dining: 'restaurant-outline',
  groceries: 'basket-outline',
  transport: 'car-outline',
  fuel: 'flame-outline',
  shopping: 'bag-handle-outline',
  home: 'storefront-outline',
  beauty: 'cut-outline',
  pharmacy: 'medkit-outline',
  health: 'pulse-outline',
  entertainment: 'film-outline',
  subscriptions: 'repeat-outline',
  kids: 'happy-outline',
  education: 'school-outline',
  travel: 'airplane-outline',
  hotels: 'bed-outline',
  insurance: 'shield-checkmark-outline',
  utilities: 'flash-outline',
  government: 'business-outline',
  housing: 'home-outline',
  fees: 'receipt-outline',
  payment: 'card-outline',
  transfer: 'swap-horizontal-outline',
  cash: 'cash-outline',
  topup: 'add-circle-outline',
  taxes: 'document-text-outline',
  other: 'ellipsis-horizontal-outline',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_ICONS);

export function getCategoryColors(
  c: ColorTokens,
): Record<string, { bg: string; ink: string; icon: string }> {
  const pairs = c.catBg.map((bg) => ({ bg, ink: c.catInk }));
  const result: Record<string, { bg: string; ink: string; icon: string }> = {};
  CATEGORY_ORDER.forEach((id, i) => {
    result[id] = { ...pairs[i % pairs.length], icon: CATEGORY_ICONS[id] };
  });
  return result;
}

// A category id is a single lowercase word (e.g. "dining"); the display label is
// just that capitalized, so no separate translation table is needed.
export function categoryLabel(id: string): string {
  if (!id) return id;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// Kept for the few call sites that need it before a theme is resolvable.
export const categoryColors = getCategoryColors(darkColors);

// Chart-series colors for Insights: assigned by rank (largest category first),
// not by category identity — a category's chart color can change month to month.
export function chartSeriesColors(c: ColorTokens): string[] {
  return [c.seg1, c.seg2, c.seg3, c.seg4, c.seg5, c.seg6, c.seg7];
}

// A curated palette real cards can be assigned to — either automatically (by
// hashing the card's id, so cards look different from each other by default)
// or explicitly, when the user picks a color for a card. The keys are stored
// in the database (cards.color_key), so existing keys must never be renamed;
// only their colors change. Gradients are deliberately subtle (one hue,
// lighter toward the corner) — the decoration shapes in CardArt carry the
// "design", not a dark-to-light ramp.
export const CARD_PALETTE: Record<string, [string, string, string]> = {
  violet: ['#8A3BF0', '#9F4FFF', '#B577FF'],
  ocean: ['#3DB2F5', '#64C6FF', '#8DD7FF'],
  forest: ['#00B36B', '#00C978', '#40DA98'],
  ember: ['#FF4433', '#FF5A47', '#FF7B6B'],
  slate: ['#1E2338', '#2A3150', '#3B4468'],
  gold: ['#FFB31A', '#FFCD6C', '#FFDB8F'],
  pink: ['#FF3E9F', '#FF58AE', '#FF7EC1'],
};

// Text color on top of each card color: dark on the light/vivid fills, light
// on violet and slate. `sub` is the secondary line (product, network, dates).
export const CARD_INK: Record<string, { main: string; sub: string }> = {
  violet: { main: '#FFFFFF', sub: 'rgba(255,255,255,0.78)' },
  ocean: { main: '#121212', sub: 'rgba(18,18,18,0.7)' },
  forest: { main: '#121212', sub: 'rgba(18,18,18,0.7)' },
  ember: { main: '#121212', sub: 'rgba(18,18,18,0.7)' },
  slate: { main: '#F4F5FA', sub: 'rgba(244,245,250,0.7)' },
  gold: { main: '#121212', sub: 'rgba(18,18,18,0.7)' },
  pink: { main: '#121212', sub: 'rgba(18,18,18,0.7)' },
};

export const CARD_PALETTE_ORDER = Object.keys(CARD_PALETTE);

// Fixed palette keys for the demo catalogue's hardcoded card ids.
export const cardArt: Record<string, string> = {
  aliado: 'ocean',
  bac: 'ember',
  davi: 'forest',
  bac2: 'violet',
};

// Display typeface (titles and large amounts). Loaded at runtime with
// expo-font in App.tsx; each weight is its own family, so never combine these
// with fontWeight. Everything else keeps the platform font.
export const fonts = {
  display: 'BricolageGrotesque_600SemiBold',
  displayMedium: 'BricolageGrotesque_500Medium',
};

export const radius = { sm: 8, md: 12, lg: 14, xl: 16, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
