import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useAppTheme } from '../theme/ThemeContext';
import { VIVID } from '../theme';

// Small hand-drawn characters used on upload and empty states only — never
// next to balances or debt, so they never read as making light of money owed.
// Outline/eye ink follows the theme; fills come from the shared vivid palette.

// A happy statement document, for the "upload a statement" boxes.
export function DocMascot({ size = 84 }: { size?: number }) {
  const { colors, isDark } = useAppTheme();
  const ink = isDark ? colors.ink : '#343433';
  const paper = isDark ? colors.surface : '#FFFFFF';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M14 66 l3 6 7 1 -5 5 1 7 -6 -4 -6 4 1 -7 -5 -5 7 -1z" fill={VIVID.honey} stroke={ink} strokeWidth={1.4} strokeLinejoin="round" />
      <Circle cx={88} cy={22} r={5.5} fill={VIVID.green} stroke={ink} strokeWidth={1.4} />
      <Path d="M32 12 h28 l14 14 v56 a5 5 0 0 1 -5 5 h-37 a5 5 0 0 1 -5 -5 v-65 a5 5 0 0 1 5 -5z" fill={paper} stroke={ink} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M60 12 v14 h14" fill={VIVID.sky} stroke={ink} strokeWidth={1.8} strokeLinejoin="round" />
      <Circle cx={43} cy={46} r={2.8} fill={ink} />
      <Circle cx={60} cy={46} r={2.8} fill={ink} />
      <Path d="M45 56 q7 7 14 0" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      <Path d="M38 68 h28 M38 75 h18" stroke={isDark ? colors.line : '#E5D5C3'} strokeWidth={3} strokeLinecap="round" />
      <Path d="M27 50 l-10 -7 M79 50 l10 -8" stroke={ink} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// A relaxed calendar, for "no payments this day" style empty states.
export function CalendarMascot({ size = 56 }: { size?: number }) {
  const { colors, isDark } = useAppTheme();
  const ink = isDark ? colors.ink : '#343433';
  const paper = isDark ? colors.surface : '#FFFFFF';
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      <Rect x={14} y={18} width={52} height={50} rx={10} fill={paper} stroke={ink} strokeWidth={1.8} />
      <Rect x={14} y={18} width={52} height={14} rx={7} fill={VIVID.violet} stroke={ink} strokeWidth={1.8} />
      <Path d="M28 12 v11 M52 12 v11" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      <Path d="M30 46 q3 -3 6 0 M44 46 q3 -3 6 0" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      <Path d="M34 56 q6 5 12 0" fill="none" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      <Path d="M70 20 l1.6 3.6 4 .4 -3 2.6 1 4 -3.6 -2 -3.6 2 1 -4 -3 -2.6 4 -.4z" fill={VIVID.honey} stroke={ink} strokeWidth={1.1} strokeLinejoin="round" />
    </Svg>
  );
}
