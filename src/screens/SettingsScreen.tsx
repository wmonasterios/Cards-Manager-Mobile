import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useAppTheme, ThemeMode } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { Segmented } from '../components/Segmented';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useCards } from '../context/CardsContext';
import * as Clipboard from 'expo-clipboard';

const INBOX = 'w.monasterios.7f3a@in.cardsmanager.app';

export function SettingsScreen({ navigation }: any) {
  const { lang, t, setLang } = useLocale();
  const { mode, setMode } = useAppTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const settings = useAppSettings();
  const { session, signOut } = useAuth();
  const { isDemo } = useCards();
  const [copied, setCopied] = React.useState(false);

  const accountEmail = session ? session.user.email ?? t.signedOut : t.signedOut;
  const accountInitials = session?.user.email ? session.user.email.slice(0, 2).toUpperCase() : '–';

  const handleAccountAction = () => {
    if (session) {
      Alert.alert(lang === 'es' ? 'Cerrar sesión' : 'Sign out', lang === 'es' ? '¿Seguro que quieres cerrar sesión?' : 'Are you sure you want to sign out?', [
        { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        { text: t.signOut, style: 'destructive', onPress: () => signOut() },
      ]);
    } else {
      navigation.navigate('Auth');
    }
  };

  const toggles = [
    { label: t.reminders, sub: t.remindersSub, on: settings.reminder, toggle: settings.toggleReminder },
    { label: t.notifyNew, sub: t.notifyNewSub, on: settings.notifyNew, toggle: settings.toggleNotifyNew },
    { label: t.weekly, sub: t.weeklySub, on: settings.weekly, toggle: settings.toggleWeekly },
    { label: t.faceLock, sub: t.faceLockSub, on: settings.faceLock, toggle: settings.toggleFaceLock },
  ];

  const copyInbox = async () => {
    await Clipboard.setStringAsync(INBOX);
    setCopied(true);
    setTimeout(() => setCopied(false), 2600);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.top}>
          <Text style={styles.title}>{t.settings}</Text>

          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{accountInitials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>{t.account.toUpperCase()}</Text>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {accountEmail}
              </Text>
            </View>
            <Pressable onPress={handleAccountAction} style={styles.accentPill}>
              <Text style={styles.accentPillText}>{session ? t.signOut : (lang === 'es' ? 'Iniciar sesión' : 'Sign in')}</Text>
            </Pressable>
          </View>
          {isDemo && (
            <Text style={styles.demoNote}>
              {lang === 'es'
                ? 'Modo demo: estás viendo datos de ejemplo. Crea una cuenta para agregar tus tarjetas reales.'
                : 'Demo mode: you are viewing example data. Create an account to add your real cards.'}
            </Text>
          )}
          {!isDemo && (
            <Pressable onPress={() => navigation.navigate('AddCard')} style={styles.addCardBtn}>
              <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
              <Text style={styles.addCardBtnText}>{lang === 'es' ? 'Agregar una tarjeta' : 'Add a card'}</Text>
            </Pressable>
          )}

          <Text style={styles.groupLabel}>{t.language.toUpperCase()}</Text>
          <View style={{ marginTop: 10 }}>
            <Segmented
              options={[
                { key: 'en', label: 'English' },
                { key: 'es', label: 'Español' },
              ]}
              value={lang}
              onChange={setLang}
            />
          </View>

          <Text style={styles.groupLabel}>{t.notifications.toUpperCase()}</Text>
          <View style={styles.listCard}>
            {toggles.map((r) => (
              <View key={r.label} style={styles.toggleRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.toggleLabel}>{r.label}</Text>
                  <Text style={styles.toggleSub}>{r.sub}</Text>
                </View>
                <Pressable
                  onPress={r.toggle}
                  style={[styles.switchTrack, { backgroundColor: r.on ? colors.tint2 : colors.line2 }]}
                >
                  <View
                    style={[
                      styles.switchKnob,
                      { left: r.on ? 20 : 2, backgroundColor: r.on ? colors.onArt : colors.ink3 },
                    ]}
                  />
                </Pressable>
              </View>
            ))}
          </View>

          <Text style={styles.groupLabel}>{t.appearance.toUpperCase()}</Text>
          <View style={{ marginTop: 10 }}>
            <Segmented
              options={[
                { key: 'light', label: t.light },
                { key: 'dark', label: t.dark },
                { key: 'system', label: t.system },
              ]}
              value={mode}
              onChange={(v: ThemeMode) => setMode(v)}
            />
          </View>

          <Text style={styles.groupLabel}>{t.support.toUpperCase()}</Text>
          <View style={styles.listCard}>
            <Pressable onPress={() => navigation.navigate('Report')} style={styles.linkRow}>
              <Ionicons name="bug-outline" size={18} color={colors.accentInk} />
              <Text style={styles.linkLabel}>{t.reportBug}</Text>
              <Text style={styles.linkChevron}>{'›'}</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Fix')} style={[styles.linkRow, styles.linkRowBorder]}>
              <Ionicons name="build-outline" size={18} color={colors.accentInk} />
              <Text style={styles.linkLabel}>{t.fixParser}</Text>
              <Text style={styles.linkChevron}>{'›'}</Text>
            </Pressable>
          </View>

          <Text style={styles.groupLabel}>{t.data.toUpperCase()}</Text>
          <View style={styles.dataCard}>
            <Text style={styles.dataLabel}>{t.inboxLabel}</Text>
            <View style={styles.inboxRow}>
              <Text style={styles.inboxText} numberOfLines={1}>
                {INBOX}
              </Text>
              <Pressable onPress={copyInbox} style={styles.copyBtn}>
                <Text style={styles.copyBtnText}>{copied ? t.copied : t.copy}</Text>
              </Pressable>
            </View>
            <Text style={styles.sendersNote}>{t.senders}: BAC, Banco Aliado, Davibank</Text>
            <View style={styles.dataActions}>
              <Pressable
                onPress={() => Alert.alert(lang === 'es' ? '312 transacciones exportadas a CSV' : '312 transactions exported to CSV')}
                style={styles.dataBtn}
              >
                <Text style={styles.dataBtnText}>{t.exportCsv}</Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  Alert.alert(lang === 'es' ? 'Se pediría confirmación antes de borrar' : 'This would ask for confirmation first')
                }
                style={[styles.dataBtn, { borderColor: colors.accentLine }]}
              >
                <Text style={[styles.dataBtnText, { color: colors.accentInk }]}>{t.deleteAll}</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.groupLabel}>{t.about.toUpperCase()}</Text>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutNote}>{t.localNote}</Text>
            <Text style={styles.aboutVersion}>{t.version}</Text>
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
    title: { fontSize: 26, fontWeight: '500', color: colors.ink, letterSpacing: -0.3 },
    accountRow: {
      marginTop: 18,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 999,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 14, fontWeight: '600', color: colors.accentInk },
    kicker: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1 },
    accountEmail: { fontSize: 13.5, fontWeight: '500', color: colors.ink, marginTop: 6 },
    accentPill: {
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: radius.md - 2,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    accentPillText: { fontSize: 11.5, fontWeight: '500', color: colors.accent },
    demoNote: { fontSize: 11.5, color: colors.ink3, marginTop: 10, lineHeight: 16 },
    addCardBtn: {
      marginTop: 10,
      padding: 13,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    addCardBtnText: { fontSize: 13, fontWeight: '500', color: colors.accent },
    groupLabel: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1, marginTop: 24 },
    listCard: {
      marginTop: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    toggleRow: {
      borderTopWidth: 1,
      borderTopColor: colors.hair,
      padding: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    toggleLabel: { fontSize: 13, fontWeight: '500', color: colors.ink },
    toggleSub: { fontSize: 11, color: colors.ink3, marginTop: 3 },
    switchTrack: { width: 44, height: 26, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
    switchKnob: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 999 },
    linkRow: {
      padding: 13,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    linkRowBorder: { borderTopWidth: 1, borderTopColor: colors.hair },
    linkLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.ink },
    linkChevron: { color: colors.ink3, fontSize: 15 },
    dataCard: {
      marginTop: 10,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
    },
    dataLabel: { fontSize: 11.5, color: colors.ink2 },
    inboxRow: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 11,
      borderRadius: radius.md - 2,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    inboxText: { flex: 1, fontSize: 11.5, fontWeight: '500', color: colors.accentInk },
    copyBtn: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    copyBtnText: { fontSize: 11, fontWeight: '500', color: colors.accent },
    sendersNote: { fontSize: 11, color: colors.ink3, marginTop: 10 },
    dataActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    dataBtn: {
      paddingVertical: 10,
      paddingHorizontal: 13,
      borderRadius: radius.md - 2,
      borderWidth: 1,
      borderColor: colors.hair4,
    },
    dataBtnText: { fontSize: 12, fontWeight: '500', color: colors.ink },
    aboutCard: {
      marginTop: 10,
      padding: 16,
      borderRadius: radius.xl,
      backgroundColor: colors.surface2,
      borderWidth: 1,
      borderColor: colors.line2,
    },
    aboutNote: { fontSize: 12, color: colors.ink2, lineHeight: 18 },
    aboutVersion: { fontSize: 11, color: colors.ink3, marginTop: 10 },
  });
}
