import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { CardArt } from '../components/CardArt';
import { BackButton } from '../components/BackButton';
import { useCards } from '../context/CardsContext';
import { REWARDS } from '../rewards';
import { Category } from '../data';

type Props = NativeStackScreenProps<RootStackParamList, 'Best'>;

const CATS: { key: Category; en: string; es: string }[] = [
  { key: 'Groceries', en: 'Groceries', es: 'Super' },
  { key: 'Dining', en: 'Dining', es: 'Restaurantes' },
  { key: 'Fuel', en: 'Fuel', es: 'Combustible' },
  { key: 'Travel', en: 'Travel', es: 'Viajes' },
  { key: 'Tech', en: 'Tech', es: 'Tecnología' },
  { key: 'Health', en: 'Health', es: 'Salud' },
];

export function BestScreen({ navigation }: Props) {
  const { lang, t } = useLocale();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { cards } = useCards();
  const [cat, setCat] = useState<Category>('Groceries');

  const ranked = useMemo(
    () =>
      cards
        .map((c) => ({ c, rate: REWARDS[c.id]?.[cat] ?? 0, note: REWARDS[c.id]?.note ?? '' }))
        .sort((a, b) => b.rate - a.rate),
    [cards, cat],
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{t.whichCard}</Text>
          <Text style={styles.sub}>{t.bestSub}</Text>
          <View style={styles.chipRow}>
            {CATS.map((c) => {
              const active = c.key === cat;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCat(c.key)}
                  style={[styles.chip, active && { backgroundColor: colors.tint2, borderColor: colors.tint2 }]}
                >
                  <Text style={[styles.chipText, active && { color: colors.onTint2 }]}>
                    {lang === 'es' ? c.es : c.en}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          {ranked.map((r, i) => (
            <Pressable
              key={r.c.id}
              onPress={() => navigation.navigate('CardDetail', { cardId: r.c.id })}
              style={styles.row}
            >
              <CardArt cardId={r.c.id} style={styles.thumb} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.bank} numberOfLines={1}>
                  {r.c.bank} {r.c.product}
                </Text>
                <Text style={styles.note} numberOfLines={1}>
                  {r.note} · {r.c.availableText} {t.availableWord}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.rate, { color: i === 0 ? colors.accentInk : colors.ink2 }]}>
                  {r.rate}
                  {lang === 'es' ? '% de vuelta' : '% back'}
                </Text>
                {i === 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{t.useThis}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          ))}
          <View style={styles.noteCard}>
            <Text style={styles.noteCardText}>
              {lang === 'es'
                ? 'Las tasas salen de la sección de recompensas de cada estado de cuenta. Las tarjetas sin cupo suficiente bajan al final.'
                : 'Rates are taken from each statement’s rewards section. Cards with no available credit for the purchase drop to the bottom.'}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    top: { paddingTop: spacing.xxl, paddingHorizontal: spacing.xl },
    title: { fontSize: 26, fontWeight: '500', color: colors.ink, marginTop: 20, letterSpacing: -0.3 },
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, maxWidth: 320 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 },
    chip: { borderWidth: 1, borderColor: colors.line, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 999 },
    chipText: { fontSize: 12, fontWeight: '500', color: colors.ink2 },
    section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: 8 },
    row: {
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    thumb: { width: 46, height: 30, borderRadius: 5 },
    bank: { fontSize: 13, fontWeight: '500', color: colors.ink },
    note: { fontSize: 11, color: colors.ink3, marginTop: 3 },
    rate: { fontSize: 14, fontWeight: '600' },
    badge: { marginTop: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.tint2 },
    badgeText: { fontSize: 10, fontWeight: '500', color: colors.onTint2 },
    noteCard: {
      padding: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    noteCardText: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
  });
}
