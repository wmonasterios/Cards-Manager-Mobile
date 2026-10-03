import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useAppSettings } from '../context/AppSettingsContext';
import { requestNotificationPermission } from '../notifications';

type Props = NativeStackScreenProps<RootStackParamList, 'NotifPrimer'>;

export function NotifPrimerScreen({ navigation }: Props) {
  const colors = useColors();
  const { t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { completeNotifPrimer } = useAppSettings();
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    setBusy(true);
    await requestNotificationPermission();
    setBusy(false);
    completeNotifPrimer();
    navigation.goBack();
  };

  const skip = () => {
    completeNotifPrimer();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="notifications" size={28} color={colors.accentInk} />
        </View>
        <Text style={styles.title}>{t.notifPrimerTitle}</Text>
        <Text style={styles.body}>{t.notifPrimerBody}</Text>

        <Pressable onPress={enable} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={colors.onTint2} /> : <Text style={styles.primaryBtnText}>{t.notifPrimerEnable}</Text>}
        </Pressable>
        <Pressable onPress={skip} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>{t.notifPrimerSkip}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center' },
    iconWrap: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.tint,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: { fontSize: 22, fontWeight: '600', color: colors.ink, textAlign: 'center' },
    body: { fontSize: 13.5, color: colors.ink2, marginTop: 10, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
    primaryBtn: {
      marginTop: 28,
      width: '100%',
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accent,
      alignItems: 'center',
    },
    primaryBtnText: { fontSize: 14, fontWeight: '500', color: colors.onTint2 },
    skipBtn: { marginTop: 12, padding: 12, borderRadius: radius.md, alignItems: 'center' },
    skipBtnText: { fontSize: 13, fontWeight: '500', color: colors.ink2 },
  });
}
