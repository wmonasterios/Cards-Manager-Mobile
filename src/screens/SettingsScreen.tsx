import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { radius, spacing, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useAppTheme, ThemeMode } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { Segmented } from '../components/Segmented';
import { useAppSettings } from '../context/AppSettingsContext';
import { useAuth } from '../context/AuthContext';
import { useCards } from '../context/CardsContext';
import * as Clipboard from 'expo-clipboard';
import { getStatementEmail } from '../supabase/statementsApi';
import { deleteAccount } from '../supabase/cardsApi';
import { hasPin, clearPin } from '../pin';
import { buildTransactionsCsv } from '../csv';
import { cancelPaymentReminders, cancelWeeklySummary, requestNotificationPermission } from '../notifications';

const DEMO_INBOX = 'demo.user.7f3a@in.cardsmanager.app';

export function SettingsScreen({ navigation }: any) {
  const { lang, t, setLang } = useLocale();
  const { mode, setMode } = useAppTheme();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const settings = useAppSettings();
  const { session, signOut } = useAuth();
  const { isDemo, cards, deleteAllData } = useCards();
  const [copied, setCopied] = React.useState(false);
  const [inbox, setInbox] = React.useState(DEMO_INBOX);
  const [exporting, setExporting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deletingAccount, setDeletingAccount] = React.useState(false);
  const [pinSet, setPinSet] = React.useState(false);

  // Re-check each time this screen gains focus, since setting/removing the
  // PIN happens on a different screen (PinSetup) and SecureStore isn't
  // reactive state we'd otherwise be notified about.
  useFocusEffect(
    React.useCallback(() => {
      hasPin().then(setPinSet).catch(() => {});
    }, []),
  );

  const handleSetOrChangePin = () => navigation.navigate('PinSetup', { isChange: pinSet });

  const handleRemovePin = () => {
    Alert.alert(t.pinSettingsRemoveConfirmTitle, t.pinSettingsRemoveConfirmBody, [
      { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
      {
        text: t.pinSettingsRemove,
        style: 'destructive',
        onPress: () => clearPin().then(() => setPinSet(false)).catch(() => {}),
      },
    ]);
  };

  React.useEffect(() => {
    if (isDemo || !session?.user.id) return;
    getStatementEmail(session.user.id)
      .then(setInbox)
      .catch(() => {});
  }, [isDemo, session?.user.id]);

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

  // Turning one of these ON is itself the explicit, self-explaining moment to
  // ask for the OS permission — unlike the automatic scheduling in
  // NotificationsSync, which only ever acts on a permission already granted.
  const toggleNotifSetting = (on: boolean, toggle: () => void) => async () => {
    if (!on) {
      // Resolve the prompt (or confirm it's already granted) before flipping
      // the setting, so the scheduler that reacts to it sees the final status.
      await requestNotificationPermission();
      settings.completeNotifPrimer();
    }
    toggle();
  };

  const toggles = [
    { label: t.reminders, sub: t.remindersSub, on: settings.reminder, toggle: toggleNotifSetting(settings.reminder, settings.toggleReminder) },
    { label: t.notifyNew, sub: t.notifyNewSub, on: settings.notifyNew, toggle: toggleNotifSetting(settings.notifyNew, settings.toggleNotifyNew) },
    { label: t.weekly, sub: t.weeklySub, on: settings.weekly, toggle: toggleNotifSetting(settings.weekly, settings.toggleWeekly) },
    { label: t.faceLock, sub: t.faceLockSub, on: settings.faceLock, toggle: settings.toggleFaceLock },
  ];

  const copyInbox = async () => {
    await Clipboard.setStringAsync(inbox);
    setCopied(true);
    setTimeout(() => setCopied(false), 2600);
  };

  const handleExportCsv = async () => {
    if (isDemo) {
      Alert.alert(lang === 'es' ? '312 transacciones exportadas a CSV' : '312 transactions exported to CSV');
      return;
    }
    setExporting(true);
    try {
      const csv = buildTransactionsCsv(cards);
      const path = `${FileSystem.cacheDirectory}poquet-transactions.csv`;
      await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: t.exportCsv });
      } else {
        Alert.alert(lang === 'es' ? 'No se pudo compartir el archivo' : 'Could not share the file');
      }
    } catch (err: any) {
      Alert.alert(lang === 'es' ? 'No se pudo exportar' : 'Could not export', err?.message ?? String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAll = () => {
    if (isDemo) {
      Alert.alert(lang === 'es' ? 'Se pediría confirmación antes de borrar' : 'This would ask for confirmation first');
      return;
    }
    Alert.alert(
      lang === 'es' ? '¿Borrar todos tus datos?' : 'Delete all your data?',
      lang === 'es'
        ? 'Se eliminan permanentemente todas tus tarjetas, transacciones, pagos y estados de cuenta. No se puede deshacer.'
        : 'This permanently deletes all your cards, transactions, payments and statements. This cannot be undone.',
      [
        { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'es' ? 'Borrar todo' : 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAllData();
            } catch (err: any) {
              Alert.alert(lang === 'es' ? 'No se pudo borrar' : 'Could not delete', err?.message ?? String(err));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    if (isDemo || !session) {
      Alert.alert(
        lang === 'es' ? 'Estás en modo demo' : "You're in demo mode",
        lang === 'es' ? 'Aquí no hay una cuenta que eliminar.' : "There's no account to delete here.",
      );
      return;
    }
    Alert.alert(
      lang === 'es' ? '¿Eliminar tu cuenta?' : 'Delete your account?',
      lang === 'es'
        ? 'Se elimina tu cuenta de Poquet junto con todas tus tarjetas, transacciones, pagos, estados de cuenta y tu dirección de reenvío. No se puede deshacer.'
        : 'This deletes your Poquet account along with all your cards, transactions, payments, statements and your forwarding address. This cannot be undone.',
      [
        { text: lang === 'es' ? 'Cancelar' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'es' ? 'Eliminar cuenta' : 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAccount();
              await Promise.all([cancelPaymentReminders(), cancelWeeklySummary()]).catch(() => {});
              Alert.alert(
                lang === 'es' ? 'Cuenta eliminada' : 'Account deleted',
                lang === 'es' ? 'Tu cuenta y tus datos se eliminaron.' : 'Your account and data have been deleted.',
              );
              // App.tsx sends the user back to the welcome screen as soon as
              // the session ends.
              await signOut();
            } catch (err: any) {
              Alert.alert(
                lang === 'es' ? 'No se pudo eliminar la cuenta' : 'Could not delete your account',
                lang === 'es'
                  ? 'Inténtalo de nuevo en un momento. Si sigue fallando, escríbenos a support@poquetapp.com.'
                  : 'Please try again in a moment. If it keeps failing, email support@poquetapp.com.',
              );
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  const es = lang === 'es';
  const Toggle = ({ on, onPress }: { on: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={[styles.switchTrack, { backgroundColor: on ? colors.tint2 : colors.line2 }]}
    >
      <View style={[styles.switchKnob, { left: on ? 20 : 2, backgroundColor: on ? colors.onTint2 : colors.ink3 }]} />
    </Pressable>
  );
  const LinkRow = ({
    icon,
    title,
    sub,
    onPress,
    first,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    sub?: string;
    onPress: () => void;
    first?: boolean;
  }) => (
    <Pressable onPress={onPress} style={[styles.navRow, !first && styles.rowBorder]} accessibilityRole="button">
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={17} color={colors.ink2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.navTitle}>{title}</Text>
        {!!sub && <Text style={styles.navSub} numberOfLines={2}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
    </Pressable>
  );
  const notifToggles = toggles.filter((r) => r.label !== t.faceLock);
  const faceToggle = toggles.find((r) => r.label === t.faceLock)!;

  // "Más" is this one screen: statements, every setting, support, data and
  // account, in the order the owner approved (Oct 2026; language sits right
  // under appearance) — no intermediate menu.
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.title}>{es ? 'Más' : 'More'}</Text>
          {isDemo && (
            <Text style={styles.demoNote}>
              {es
                ? 'Modo demo: estás viendo datos de ejemplo. Crea una cuenta para agregar tus tarjetas reales.'
                : 'Demo mode: you are viewing example data. Create an account to add your real cards.'}
            </Text>
          )}

          <Text style={[styles.groupLabel, { marginTop: 18 }]}>{es ? 'ESTADOS DE CUENTA' : 'STATEMENTS'}</Text>
          <View style={styles.listCard}>
            <LinkRow
              first
              icon="cloud-upload-outline"
              title={es ? 'Agregar un estado de cuenta' : 'Add a statement'}
              sub={es ? 'Sube el PDF o reenvía el correo · historial' : 'Upload the PDF or forward the email · history'}
              onPress={() => navigation.navigate('Statements', { cardId: undefined })}
            />
          </View>

          <Text style={styles.groupLabel}>{t.notifications.toUpperCase()}</Text>
          <View style={styles.listCard}>
            {notifToggles.map((r, i) => (
              <View key={r.label} style={[styles.toggleRow, i > 0 && styles.rowBorder]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.toggleLabel}>{r.label}</Text>
                  <Text style={styles.toggleSub}>{r.sub}</Text>
                </View>
                <Toggle on={r.on} onPress={r.toggle} />
              </View>
            ))}
          </View>

          <Text style={styles.groupLabel}>{t.security.toUpperCase()}</Text>
          <View style={styles.listCard}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.toggleLabel}>{faceToggle.label}</Text>
                <Text style={styles.toggleSub}>{faceToggle.sub}</Text>
              </View>
              <Toggle on={faceToggle.on} onPress={faceToggle.toggle} />
            </View>
            {session && (
              <>
                <Pressable onPress={handleSetOrChangePin} style={[styles.toggleRow, styles.rowBorder]}>
                  <Text style={[styles.toggleLabel, { flex: 1 }]}>{pinSet ? t.pinSettingsChange : t.pinSettingsSet}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
                </Pressable>
                {pinSet && (
                  <Pressable onPress={handleRemovePin} style={[styles.toggleRow, styles.rowBorder]}>
                    <Text style={[styles.toggleLabel, { flex: 1, color: colors.ink2 }]}>{t.pinSettingsRemove}</Text>
                  </Pressable>
                )}
              </>
            )}
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

          <Text style={styles.groupLabel}>{t.support.toUpperCase()}</Text>
          <View style={styles.listCard}>
            <LinkRow
              first
              icon="chatbubble-ellipses-outline"
              title={es ? 'Escríbenos' : 'Contact us'}
              sub="support@poquetapp.com"
              onPress={() => Linking.openURL('mailto:support@poquetapp.com').catch(() => {})}
            />
            <LinkRow icon="bug-outline" title={t.reportBug} onPress={() => navigation.navigate('Report')} />
            <LinkRow icon="build-outline" title={t.fixParser} onPress={() => navigation.navigate('Fix')} />
          </View>

          <Text style={styles.groupLabel}>{t.data.toUpperCase()}</Text>
          <View style={styles.dataCard}>
            <Text style={styles.dataLabel}>{t.inboxLabel}</Text>
            <View style={styles.inboxRow}>
              <Text style={styles.inboxText} numberOfLines={1}>
                {inbox}
              </Text>
              <Pressable onPress={copyInbox} style={styles.copyBtn}>
                <Text style={styles.copyBtnText}>{copied ? t.copied : t.copy}</Text>
              </Pressable>
            </View>
            <View style={styles.dataActions}>
              <Pressable onPress={handleExportCsv} disabled={exporting} style={[styles.dataBtn, exporting && { opacity: 0.6 }]}>
                {exporting ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.dataBtnText}>{t.exportCsv}</Text>}
              </Pressable>
              <Pressable onPress={handleDeleteAll} disabled={deleting} style={[styles.dataBtn, deleting && { opacity: 0.6 }]}>
                {deleting ? (
                  <ActivityIndicator color={colors.ink2} />
                ) : (
                  <Text style={[styles.dataBtnText, { color: colors.ink2 }]}>{t.deleteAll}</Text>
                )}
              </Pressable>
              {session && (
                <Pressable
                  onPress={handleDeleteAccount}
                  disabled={deletingAccount}
                  style={[styles.dataBtn, deletingAccount && { opacity: 0.6 }]}
                >
                  {deletingAccount ? (
                    <ActivityIndicator color={colors.ink2} />
                  ) : (
                    <Text style={[styles.dataBtnText, { color: colors.ink2 }]}>{t.deleteAccount}</Text>
                  )}
                </Pressable>
              )}
            </View>
          </View>

          <Text style={styles.groupLabel}>{t.account.toUpperCase()}</Text>
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{accountInitials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.kicker}>{session ? (es ? 'Sesión iniciada como' : 'Signed in as') : t.account}</Text>
              <Text style={styles.accountEmail} numberOfLines={1}>
                {accountEmail}
              </Text>
            </View>
            <Pressable onPress={handleAccountAction} style={styles.accentPill}>
              <Text style={styles.accentPillText}>{session ? t.signOut : es ? 'Iniciar sesión' : 'Sign in'}</Text>
            </Pressable>
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
    title: { fontSize: 26, fontFamily: fonts.displayMedium, color: colors.ink, letterSpacing: -0.3 },
    accountRow: {
      marginTop: 10,
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
      borderColor: colors.line,
    },
    accentPillText: { fontSize: 13, fontWeight: '700', color: colors.ink },
    demoNote: { fontSize: 11.5, color: colors.ink3, marginTop: 10, lineHeight: 16 },
    groupLabel: { fontSize: 11.5, fontWeight: '700', color: colors.ink3, letterSpacing: 1, marginTop: 24 },
    listCard: {
      marginTop: 10,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    toggleRow: {
      minHeight: 56,
      paddingVertical: 10,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.ink },
    toggleSub: { fontSize: 12, color: colors.ink3, marginTop: 2 },
    switchTrack: { width: 44, height: 26, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
    switchKnob: { position: 'absolute', top: 2, width: 20, height: 20, borderRadius: 999 },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
    navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 9, paddingHorizontal: 14 },
    iconBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' },
    navTitle: { fontSize: 14, fontWeight: '600', color: colors.ink },
    navSub: { fontSize: 12, color: colors.ink3, marginTop: 2, lineHeight: 16 },
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
      borderColor: colors.line,
    },
    copyBtnText: { fontSize: 11, fontWeight: '500', color: colors.ink },
    dataActions: { gap: 8, marginTop: 14 },
    dataBtn: {
      paddingVertical: 10,
      paddingHorizontal: 13,
      borderRadius: radius.md - 2,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
    },
    dataBtnText: { fontSize: 13.5, fontWeight: '600', color: colors.ink },
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
