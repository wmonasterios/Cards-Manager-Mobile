import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { useAppSettings } from '../context/AppSettingsContext';

type Props = NativeStackScreenProps<RootStackParamList, 'SecuritySetup'>;

export function SecuritySetupScreen({ navigation, route }: Props) {
  const colors = useColors();
  const { t } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { faceLock, toggleFaceLock } = useAppSettings();
  const [busy, setBusy] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hasHardware, isEnrolled]) => setBiometricAvailable(hasHardware && isEnrolled))
      .catch(() => setBiometricAvailable(false));
  }, []);

  const finish = () => {
    if (route.params?.fromOnboarding) {
      navigation.replace('Tabs', { screen: 'Statements' });
    } else {
      navigation.goBack();
    }
  };

  const enableFaceId = async () => {
    setBusy(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t.unlockPrompt });
      if (result.success) {
        if (!faceLock) toggleFaceLock();
        finish();
      }
    } finally {
      setBusy(false);
    }
  };

  const setPin = () => {
    navigation.replace('PinSetup', { fromOnboarding: route.params?.fromOnboarding, thenFinishAuth: true });
  };

  if (biometricAvailable === null) return <SafeAreaView style={styles.screen} />;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={28} color={colors.accentInk} />
        </View>
        <Text style={styles.title}>{t.securitySetupTitle}</Text>
        <Text style={styles.body}>{biometricAvailable ? t.securitySetupBodyFaceId : t.securitySetupBodyPinOnly}</Text>

        {biometricAvailable ? (
          <>
            <Pressable onPress={enableFaceId} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color={colors.onTint2} /> : <Text style={styles.primaryBtnText}>{t.securitySetupEnableFaceId}</Text>}
            </Pressable>
            <Pressable onPress={setPin} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>{t.securitySetupUsePinInstead}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={setPin} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{t.securitySetupSetPin}</Text>
          </Pressable>
        )}
        <Pressable onPress={finish} style={styles.skipBtn}>
          <Text style={styles.skipBtnText}>{t.securitySetupSkip}</Text>
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
    title: { fontSize: 22, fontFamily: fonts.display, color: colors.ink, textAlign: 'center' },
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
    secondaryBtn: { marginTop: 12, padding: 12, borderRadius: radius.md, alignItems: 'center' },
    secondaryBtnText: { fontSize: 13.5, fontWeight: '500', color: colors.ink2 },
    skipBtn: { marginTop: 4, padding: 12, borderRadius: radius.md, alignItems: 'center' },
    skipBtnText: { fontSize: 13, fontWeight: '500', color: colors.ink3 },
  });
}
