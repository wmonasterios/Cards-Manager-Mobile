import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useT } from '../i18n/LocaleContext';
import { CardArt } from '../components/CardArt';
import { useCards } from '../context/CardsContext';
import { money } from '../format';
import { deriveStatus, StatusRow } from '../status';

const RING_R = 15;

// Exported so CardDetailScreen's hero can match this size exactly.
export const CARD_HEIGHT = 214;
const CARD_STEP = 86;

// A light band sweeps left-to-right across each block on a loop — the classic
// "this is actively loading" shimmer, instead of a flat pulse that can read
// as static (or even broken) if someone isn't looking right at it.
function Shimmer({ style }: { style: any }) {
  const [width, setWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!width) return;
    translateX.setValue(-width);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: width,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [width, translateX]);

  return (
    <View style={[style, { overflow: 'hidden' }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.09)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

export function HomeScreen({ navigation }: any) {
  const { cards, isDemo, loaded, loadError, refresh } = useCards();
  const colors = useColors();
  const t = useT();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!loaded && cards.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Shimmer style={[styles.skelBlock, { width: 90, height: 11 }]} />
            <Shimmer style={[styles.skelBlock, { width: 150, height: 30, marginTop: 10 }]} />
            <Shimmer style={[styles.skelBlock, { width: 120, height: 11, marginTop: 9 }]} />
          </View>
        </View>
        <View style={[styles.stack, { height: CARD_HEIGHT, marginTop: 18 }]}>
          <Shimmer style={[styles.stackSlot, styles.skelCard, { top: 0 }]} />
        </View>
        <View style={styles.statusSection}>
          <View style={styles.statusList}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.statusRow, styles.skelRow]}>
                <Shimmer style={styles.skelRing} />
                <View style={{ flex: 1, gap: 7 }}>
                  <Shimmer style={[styles.skelBlock, { width: '55%', height: 12 }]} />
                  <Shimmer style={[styles.skelBlock, { width: '38%', height: 10 }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const unpaid = cards.filter((c) => !c.paid);
  const totalOwed = unpaid.reduce((n, c) => n + c.remaining, 0);
  const stackHeight = CARD_HEIGHT + (cards.length - 1) * CARD_STEP;
  // Computed fresh on every render (not memoized against mount time) so a
  // card that crosses a due-date threshold overnight updates without a reload.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const status = useMemo(() => deriveStatus(cards, todayIso, t, colors), [cards, todayIso, t, colors]);

  const goToAction = (r: StatusRow) => {
    if (r.action === 'upload' || r.action === 'review') {
      navigation.navigate('Statements', { cardId: r.card.id });
    } else if (r.action === 'pay') {
      navigation.navigate('Pay', { cardId: r.card.id });
    } else {
      navigation.navigate('CardDetail', { cardId: r.card.id });
    }
  };

  const nextDueText = !unpaid.length
    ? t.everythingPaidCycle
    : isDemo
      ? t.demoDueBanner
      : `${unpaid.length} ${t.cardsWord} ${t.withBalanceDue}`;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>{t.totalOwed.toUpperCase()}</Text>
            <Text style={styles.total}>{money('US$', totalOwed)}</Text>
            <Text style={styles.totalNote}>
              {cards.length} {t.cardsWord} · {unpaid.length} {t.withBalance}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => navigation.navigate('Transactions', {})}
              style={styles.iconBtn}
              hitSlop={6}
            >
              <Text style={styles.iconBtnText}>{'⌕'}</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Statements')}
              style={[styles.iconBtn, styles.iconBtnAccent]}
              hitSlop={6}
            >
              <Text style={[styles.iconBtnText, { color: colors.accent }]}>+</Text>
            </Pressable>
          </View>
        </View>

        {cards.length > 0 && (
          <View style={styles.dueBanner}>
            <View style={styles.dueDot} />
            <Text style={styles.dueText}>{nextDueText}</Text>
          </View>
        )}

        {cards.length === 0 && loadError && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>{t.couldntLoadCards}</Text>
            <Text style={styles.emptyStateBody}>{t.checkConnectionRetry}</Text>
            <Pressable onPress={() => refresh()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>{t.retry}</Text>
            </Pressable>
          </View>
        )}

        {cards.length === 0 && !loadError && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>{t.noCardsYet}</Text>
            <Text style={styles.emptyStateBody}>{t.tapPlusAddFirst}</Text>
          </View>
        )}

        <View style={[styles.stack, { height: cards.length ? stackHeight : 0 }]}>
          {cards.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => navigation.navigate('CardDetail', { cardId: c.id })}
              style={[styles.stackSlot, { top: i * CARD_STEP, zIndex: 10 + i }]}
            >
              <CardArt cardId={c.id} colorKey={c.colorKey} style={styles.cardArt}>
                <View style={styles.cardTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardBank}>{c.displayName}</Text>
                    <Text style={styles.cardSub}>
                      {c.displaySub} · {c.last4}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.cardBalance}>{c.balanceText}</Text>
                    <Text style={styles.cardSub}>{c.dueShort}</Text>
                  </View>
                </View>
                <Text style={styles.cardNetwork}>{c.network.toUpperCase()}</Text>
              </CardArt>
            </Pressable>
          ))}
        </View>

        {cards.length > 0 && (
          <View style={styles.statusSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{status.title}</Text>
              <Text style={styles.statusNote}>{status.note}</Text>
            </View>

            <View style={styles.healthBar}>
              {status.segments.map((s, i) => (
                <View key={i} style={[styles.healthSeg, { backgroundColor: s.color, width: `${s.pct}%` }]} />
              ))}
            </View>

            <View style={styles.statusList}>
              {status.rows.map((r) => (
                <Pressable
                  key={r.card.id}
                  onPress={() => goToAction(r)}
                  style={[styles.statusRow, { borderColor: r.act ? colors.tint2 : colors.line }]}
                >
                  <View style={styles.ringWrap}>
                    <View style={styles.ring}>
                      <Svg
                        viewBox="0 0 36 36"
                        width="100%"
                        height="100%"
                        style={{ transform: [{ rotate: '-90deg' }] }}
                      >
                        <Circle cx={18} cy={18} r={RING_R} fill="none" stroke={colors.line2} strokeWidth={3} />
                        <Circle
                          cx={18}
                          cy={18}
                          r={RING_R}
                          fill="none"
                          stroke={r.ringColor}
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeDasharray={r.ringDash}
                        />
                      </Svg>
                      <View style={styles.ringTextWrap}>
                        <Text style={[styles.ringNum, { color: r.numInk }]}>{r.ringNum}</Text>
                        <Text style={styles.ringUnit}>{r.ringUnit}</Text>
                      </View>
                    </View>
                    <Text style={styles.ringCaption} numberOfLines={1}>
                      {r.ringCaption}
                    </Text>
                  </View>

                  <View style={styles.statusMid}>
                    <View style={styles.statusTitleRow}>
                      <CardArt cardId={r.card.id} colorKey={r.card.colorKey} style={styles.statusSwatch} />
                      <Text style={styles.statusTitle} numberOfLines={1}>
                        {r.title}
                      </Text>
                    </View>
                    <Text style={styles.statusSub} numberOfLines={1}>
                      {r.sub}
                    </Text>
                    {r.chips.length > 0 && (
                      <View style={styles.statusChips}>
                        {r.chips.map((ch, i) => (
                          <View key={i} style={[styles.statusChip, { backgroundColor: ch.bg }]}>
                            <Text style={[styles.statusChipText, { color: ch.ink }]}>{ch.text}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={[styles.actionPill, { borderColor: r.act ? colors.accent : colors.hair4 }]}>
                    <Text style={[styles.actionPillText, { color: r.act ? colors.accent : colors.ink3 }]}>
                      {r.actionLabel}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scrollContent: { paddingBottom: 40 },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxl,
    },
    kicker: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 1.2,
      color: colors.ink3,
      textTransform: 'uppercase',
    },
    total: { fontSize: 34, fontWeight: '600', color: colors.ink, marginTop: 8, letterSpacing: -0.5 },
    totalNote: { fontSize: 12, color: colors.ink3, marginTop: 4 },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.hair4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBtnAccent: { borderColor: colors.accent },
    iconBtnText: { color: colors.ink, fontSize: 18 },
    dueBanner: {
      marginTop: 14,
      marginHorizontal: spacing.xl,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      backgroundColor: colors.tint,
      borderWidth: 1,
      borderColor: colors.tint2,
    },
    dueDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentInk2 },
    dueText: { fontSize: 12.5, fontWeight: '500', color: colors.accentInk, flexShrink: 1 },
    emptyState: {
      marginTop: 18,
      marginHorizontal: spacing.xl,
      padding: 24,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.hair4,
      alignItems: 'center',
    },
    emptyStateTitle: { fontSize: 15, fontWeight: '500', color: colors.ink },
    emptyStateBody: { fontSize: 12.5, color: colors.ink3, marginTop: 6, textAlign: 'center' },
    retryBtn: {
      marginTop: 14,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: radius.md - 2,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    retryBtnText: { fontSize: 12.5, fontWeight: '500', color: colors.accent },
    stack: { marginTop: 18, paddingHorizontal: spacing.lg, position: 'relative' },
    stackSlot: { position: 'absolute', left: spacing.lg, right: spacing.lg, height: CARD_HEIGHT },
    cardArt: {
      flex: 1,
      borderRadius: radius.xl,
      padding: 18,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOpacity: 0.55,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: -12 },
      elevation: 6,
    },
    cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardBank: { fontSize: 15, fontWeight: '600', color: colors.onArt, letterSpacing: 0.2 },
    cardSub: { fontSize: 11.5, color: 'rgba(243,245,254,0.62)', marginTop: 3 },
    cardBalance: { fontSize: 17, fontWeight: '600', color: colors.onArt },
    cardNetwork: { fontSize: 10.5, fontWeight: '500', letterSpacing: 1.4, color: 'rgba(243,245,254,0.62)' },
    sectionHeader: {
      marginTop: 8,
      paddingHorizontal: spacing.xl,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    sectionTitle: { fontSize: 16, fontWeight: '500', color: colors.ink },
    statusSection: { marginTop: 4 },
    statusNote: { fontSize: 11, color: colors.ink3 },
    healthBar: { flexDirection: 'row', gap: 3, height: 5, marginTop: 12, marginHorizontal: spacing.xl },
    healthSeg: { borderRadius: radius.pill, height: 5 },
    statusList: { marginTop: 12, marginHorizontal: spacing.xl, gap: 8 },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
    },
    ringWrap: { alignItems: 'center' },
    ring: { width: 44, height: 44, position: 'relative' },
    ringCaption: { fontSize: 8.5, color: colors.ink3, marginTop: 4, maxWidth: 56, textAlign: 'center' },
    ringTextWrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringNum: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
    ringUnit: { fontSize: 7.5, color: colors.ink3, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 1 },
    statusMid: { flex: 1, minWidth: 0 },
    statusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    statusSwatch: { width: 16, height: 11, borderRadius: 2 },
    statusTitle: { fontSize: 13, fontWeight: '500', color: colors.ink, flexShrink: 1 },
    statusSub: { fontSize: 11, color: colors.ink3, marginTop: 5, lineHeight: 15 },
    statusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
    statusChip: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
    statusChipText: { fontSize: 10, fontWeight: '500' },
    actionPill: { paddingVertical: 8, paddingHorizontal: 11, borderRadius: radius.pill, borderWidth: 1 },
    actionPillText: { fontSize: 11, fontWeight: '500' },
    skelBlock: { borderRadius: 6, backgroundColor: colors.line2 },
    skelCard: { borderRadius: radius.xl, backgroundColor: colors.surface2, height: CARD_HEIGHT },
    skelRow: { borderColor: colors.line },
    skelRing: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.line2 },
  });
}
