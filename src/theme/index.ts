// Nocturne design-system tokens, taken from the Cards Manager mockup.
export type ColorTokens = typeof darkColors;

export const darkColors = {
  bg: '#161826',
  surface: '#232532',
  surface2: '#1d1f2b',
  ink: '#e9e9ed',
  ink2: '#9397ab',
  ink3: '#75798c',
  ink2b: '#b2b6ca',
  line: '#3f424d',
  line2: '#292b31',
  tint: '#2b2741',
  tint2: '#423a6a',
  accentLine: '#5d5294',
  accentInk: '#d2cefd',
  accentInk2: '#b5abfc',
  onTint2: '#f5f4ff',
  accent: '#9184d9',
  bar: '#796cbf',
  tintInk2: '#e4e7f5',
  tintInk3: '#cfd3e5',
  tintInk: '#e7e5fe',
  onArt: '#f3f5fe',
  hair: 'rgba(233,233,237,0.08)',
  hair2: 'rgba(233,233,237,0.1)',
  hair3: 'rgba(233,233,237,0.12)',
  hair4: 'rgba(233,233,237,0.16)',
  hair5: 'rgba(233,233,237,0.18)',
  seg1: '#b5abfc',
  seg2: '#9184d9',
  seg3: '#796cbf',
  seg4: '#5d5294',
  seg5: '#423a6a',
  seg6: '#6b6f80',
  seg7: '#3f424d',
};

// Previous light palette kept everything — surfaces, hairlines, and the
// "active" chip/pill fill — inside one narrow band of pale lavender, so
// selected states barely read as different from the resting background.
// This keeps the same purple family (for continuity with dark mode and the
// brand) but gives "active" states a solid, saturated fill with white ink
// (mirroring how dark mode's own tint2/onTint2 pair already works) instead
// of a slightly-less-pale pastel, and deepens hairlines/borders enough to
// actually read as edges against the light background.
export const lightColors: ColorTokens = {
  bg: '#e9ebf6',
  surface: '#f7f8fd',
  surface2: '#eef0f9',
  ink: '#292b31',
  ink2: '#595d6c',
  ink3: '#6b6f80',
  ink2b: '#3f424d',
  line: '#c3c8de',
  line2: '#dde1f0',
  tint: '#ded9fb',
  tint2: '#7a6cc0',
  accentLine: '#a89bf5',
  accentInk: '#3a3363',
  accentInk2: '#544a8c',
  onTint2: '#ffffff',
  accent: '#6a5cc2',
  bar: '#6a5cc2',
  tintInk2: '#3f424d',
  tintInk3: '#3f424d',
  tintInk: '#ffffff',
  onArt: '#f3f5fe',
  hair: 'rgba(41,43,49,0.08)',
  hair2: 'rgba(41,43,49,0.1)',
  hair3: 'rgba(41,43,49,0.12)',
  hair4: 'rgba(41,43,49,0.18)',
  hair5: 'rgba(41,43,49,0.22)',
  seg1: '#544a8c',
  seg2: '#6a5cc2',
  seg3: '#8879d6',
  seg4: '#a89bf5',
  seg5: '#3a3363',
  seg6: '#767a8c',
  seg7: '#4a4d5e',
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
  const pairs = [
    { bg: c.line, ink: c.tintInk2 },
    { bg: c.tint, ink: c.accentInk },
    { bg: c.line2, ink: c.tintInk3 },
    { bg: c.tint2, ink: c.tintInk },
    { bg: c.tint, ink: c.accentInk2 },
    { bg: c.line, ink: c.ink2 },
  ];
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

// Fixed gradients for the demo catalogue's hardcoded card ids.
export const cardArt: Record<string, [string, string, string]> = {
  aliado: ['#131b30', '#22375f', '#2f4d84'],
  bac: ['#2a1420', '#5a2333', '#7c3145'],
  davi: ['#19202b', '#2c3a47', '#3e5163'],
  bac2: ['#1b1e27', '#31353f', '#474c58'],
};

// A curated palette real cards can be assigned to — either automatically (by
// hashing the card's id, so cards look different from each other by default)
// or explicitly, when the user picks a color for a card.
export const CARD_PALETTE: Record<string, [string, string, string]> = {
  violet: ['#1c1730', '#332a5c', '#4a3d86'],
  ocean: ['#0f1f2e', '#1c3a54', '#2a5980'],
  forest: ['#12261c', '#1f4231', '#2d6247'],
  ember: ['#2a1420', '#5a2333', '#7c3145'],
  slate: ['#1b1e27', '#31353f', '#474c58'],
  gold: ['#2a2210', '#5c4a1c', '#8a7128'],
};

export const CARD_PALETTE_ORDER = Object.keys(CARD_PALETTE);

export const radius = { sm: 8, md: 12, lg: 14, xl: 16, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
