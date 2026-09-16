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
};

export const lightColors: ColorTokens = {
  bg: '#e9ebf6',
  surface: '#f7f8fd',
  surface2: '#eef0f9',
  ink: '#292b31',
  ink2: '#595d6c',
  ink3: '#6b6f80',
  ink2b: '#3f424d',
  line: '#cfd3e5',
  line2: '#e4e7f5',
  tint: '#e7e5fe',
  tint2: '#d2cefd',
  accentLine: '#b5abfc',
  accentInk: '#423a6a',
  accentInk2: '#5d5294',
  onTint2: '#2b2741',
  accent: '#796cbf',
  bar: '#796cbf',
  tintInk2: '#3f424d',
  tintInk3: '#3f424d',
  tintInk: '#423a6a',
  onArt: '#f3f5fe',
  hair: 'rgba(41,43,49,0.08)',
  hair2: 'rgba(41,43,49,0.1)',
  hair3: 'rgba(41,43,49,0.12)',
  hair4: 'rgba(41,43,49,0.16)',
  hair5: 'rgba(41,43,49,0.18)',
};

// Default export kept for call sites that only ever run in dark mode (rare).
export const colors = darkColors;

export function getCategoryColors(c: ColorTokens): Record<string, { bg: string; ink: string; initials: string }> {
  return {
    Groceries: { bg: c.line, ink: c.tintInk2, initials: 'GR' },
    Dining: { bg: c.tint, ink: c.accentInk, initials: 'DI' },
    Travel: { bg: c.line2, ink: c.tintInk3, initials: 'TR' },
    Tech: { bg: c.tint2, ink: c.tintInk, initials: 'TE' },
    Fuel: { bg: c.line, ink: c.tintInk2, initials: 'FU' },
    Health: { bg: c.line2, ink: c.tintInk3, initials: 'HE' },
    Services: { bg: c.tint, ink: c.accentInk, initials: 'SE' },
    Payment: { bg: c.tint, ink: c.accentInk2, initials: 'PY' },
  };
}

// Kept for the few call sites that need it before a theme is resolvable.
export const categoryColors = getCategoryColors(darkColors);

export const cardArt: Record<string, [string, string, string]> = {
  aliado: ['#131b30', '#22375f', '#2f4d84'],
  bac: ['#2a1420', '#5a2333', '#7c3145'],
  davi: ['#19202b', '#2c3a47', '#3e5163'],
  bac2: ['#1b1e27', '#31353f', '#474c58'],
};

export const radius = { sm: 8, md: 12, lg: 14, xl: 16, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
