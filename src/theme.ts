// Nocturne (dark) design-system tokens, taken from the Cards Manager mockup.
export const colors = {
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

export const categoryColors: Record<string, { bg: string; ink: string; initials: string }> = {
  Groceries: { bg: colors.line, ink: colors.tintInk2, initials: 'GR' },
  Dining: { bg: colors.tint, ink: colors.accentInk, initials: 'DI' },
  Travel: { bg: colors.line2, ink: colors.tintInk3, initials: 'TR' },
  Tech: { bg: colors.tint2, ink: colors.tintInk, initials: 'TE' },
  Fuel: { bg: colors.line, ink: colors.tintInk2, initials: 'FU' },
  Health: { bg: colors.line2, ink: colors.tintInk3, initials: 'HE' },
  Services: { bg: colors.tint, ink: colors.accentInk, initials: 'SE' },
  Payment: { bg: colors.tint, ink: colors.accentInk2, initials: 'PY' },
};

export const cardArt: Record<string, [string, string, string]> = {
  aliado: ['#131b30', '#22375f', '#2f4d84'],
  bac: ['#2a1420', '#5a2333', '#7c3145'],
  davi: ['#19202b', '#2c3a47', '#3e5163'],
  bac2: ['#1b1e27', '#31353f', '#474c58'],
};

export const radius = { sm: 8, md: 12, lg: 14, xl: 16, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
