import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';

// The tabs shown in the floating bar. Statements and Settings are still tab
// routes (so every existing navigate('Statements') keeps working) but live
// under "More" — while one of them is open, "More" is the highlighted tab.
const VISIBLE = ['Home', 'Calendar', 'Insights', 'More'] as const;
type Visible = (typeof VISIBLE)[number];
const UNDER_MORE = new Set(['More', 'Statements', 'Settings']);

const ICONS: Record<Visible, keyof typeof Ionicons.glyphMap> = {
  Home: 'albums-outline',
  Calendar: 'calendar-outline',
  Insights: 'pie-chart-outline',
  More: 'menu-outline',
};

// The advisor button shows for everyone (owner's call, Oct 2026). Who can
// actually chat is decided server-side (plans / advisor_access); the demo gets
// sample answers from advisorDemo.ts.

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { lang, t } = useLocale();
  const es = lang === 'es';

  const current = state.routes[state.index]?.name;
  const activeTab: Visible = UNDER_MORE.has(current) ? 'More' : (current as Visible);
  const labels: Record<Visible, string> = {
    Home: t.cards,
    Calendar: t.calendarTab,
    Insights: t.insightsTab,
    More: es ? 'Más' : 'More',
  };

  const go = (name: Visible) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(name as never);
  };

  // In the demo the advisor answers its suggested questions from the sample
  // cards (see advisorDemo.ts), so it opens the same screen either way.
  const openAdvisor = () => navigation.navigate('Advisor' as never);

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.capsule} accessibilityRole="tablist">
        {VISIBLE.map((name) => {
          const focused = activeTab === name;
          return (
            <Pressable
              key={name}
              onPress={() => go(name)}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={labels[name]}
            >
              <View style={[styles.iconPill, focused && { backgroundColor: colors.accent }]}>
                <Ionicons name={ICONS[name]} size={20} color={focused ? colors.onTint2 : colors.ink3} />
              </View>
              <Text style={[styles.label, { color: focused ? colors.ink : colors.ink3, fontWeight: focused ? '600' : '500' }]}>
                {labels[name]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {(
        <Pressable
          onPress={openAdvisor}
          style={styles.advisorBtn}
          accessibilityRole="button"
          accessibilityLabel={es ? 'Abrir Asesor Poquet' : 'Open Poquet Advisor'}
        >
          <View style={[styles.advisorRing, { borderColor: colors.accent }]}>
            <Ionicons name="sparkles" size={20} color={colors.accent} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

function makeStyles(colors: ColorTokens) {
  const shadow = {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  };
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 12,
      paddingTop: 8,
      backgroundColor: colors.bg,
    },
    capsule: {
      flex: 1,
      height: 64,
      borderRadius: 26,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
      ...shadow,
    },
    item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
    iconPill: { width: 44, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 10.5 },
    advisorBtn: {
      width: 64,
      height: 64,
      borderRadius: 26,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    advisorRing: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
