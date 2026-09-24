import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as AppleAuthentication from 'expo-apple-authentication';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useAppTheme } from '../theme/ThemeContext';
import { BackButton } from '../components/BackButton';
import { Segmented } from '../components/Segmented';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;
type Mode = 'signin' | 'signup';

export function AuthScreen({ navigation }: Props) {
  const colors = useColors();
  const { isDark } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signIn, signUp, confirmSignup, resendConfirmation, signInWithGoogle, signInWithApple } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  const handleGoogle = async () => {
    setGoogleBusy(true);
    const { error } = await signInWithGoogle();
    setGoogleBusy(false);
    if (error) {
      Alert.alert('Could not sign in with Google', error);
      return;
    }
    navigation.goBack();
  };

  const handleApple = async () => {
    const { error } = await signInWithApple();
    if (error) {
      Alert.alert('Could not sign in with Apple', error);
      return;
    }
    navigation.goBack();
  };

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Enter your email and password.');
      return;
    }
    setBusy(true);
    const result = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (result.error) {
      Alert.alert('Could not sign in', result.error);
      return;
    }
    if (mode === 'signup' && 'needsConfirmation' in result && result.needsConfirmation) {
      setAwaitingCode(true);
      return;
    }
    navigation.goBack();
  };

  const submitCode = async () => {
    if (!code.trim()) {
      Alert.alert('Enter the code from your email.');
      return;
    }
    setBusy(true);
    const { error } = await confirmSignup(email.trim(), code.trim());
    setBusy(false);
    if (error) {
      Alert.alert('Could not confirm your account', error);
      return;
    }
    navigation.goBack();
  };

  const resendCode = async () => {
    setResending(true);
    const { error } = await resendConfirmation(email.trim());
    setResending(false);
    if (error) {
      Alert.alert('Could not resend the code', error);
      return;
    }
    Alert.alert('Code sent', 'Check your email for a new code.');
  };

  if (awaitingCode) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.top}>
            <BackButton onPress={() => setAwaitingCode(false)} />
            <Text style={styles.title}>Confirm your email</Text>
            <Text style={styles.sub}>
              We emailed a 6-digit code to {email.trim()}. Enter it below to finish creating your account.
            </Text>

            <Text style={styles.label}>CODE</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.ink3}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              style={styles.input}
            />

            <Pressable onPress={submitCode} disabled={busy} style={[styles.submitBtn, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.submitBtnText}>Confirm</Text>}
            </Pressable>

            <Pressable onPress={resendCode} disabled={resending} hitSlop={8} style={{ marginTop: 16 }}>
              <Text style={styles.resendText}>{resending ? 'Sending…' : 'Resend code'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={styles.title}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
          <Text style={styles.sub}>
            Sign in to keep your real cards synced across devices. Without an account you can still
            explore the app with demo data.
          </Text>

          <View style={{ marginTop: 18 }}>
            <Segmented
              options={[
                { key: 'signin', label: 'Sign in' },
                { key: 'signup', label: 'Create account' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </View>

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.ink3}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            style={styles.input}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.ink3}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />

          <Pressable onPress={submit} disabled={busy} style={[styles.submitBtn, busy && { opacity: 0.6 }]}>
            {busy ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.submitBtnText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable onPress={handleGoogle} disabled={googleBusy} style={[styles.googleBtn, googleBusy && { opacity: 0.6 }]}>
            {googleBusy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            )}
          </Pressable>

          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={radius.md}
              style={styles.appleBtn}
              onPress={handleApple}
            />
          )}
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
    sub: { fontSize: 12.5, color: colors.ink2, marginTop: 8, lineHeight: 18, maxWidth: 340 },
    label: { fontSize: 11, fontWeight: '500', color: colors.ink3, letterSpacing: 1, marginTop: 20 },
    input: {
      marginTop: 10,
      padding: 13,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontSize: 14,
    },
    submitBtn: {
      marginTop: 24,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: 'center',
    },
    submitBtnText: { fontSize: 14, fontWeight: '500', color: colors.accent },
    resendText: { fontSize: 12.5, fontWeight: '500', color: colors.ink2, textAlign: 'center' },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
    dividerText: { fontSize: 11.5, color: colors.ink3 },
    googleBtn: {
      marginTop: 22,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    googleBtnText: { fontSize: 14, fontWeight: '500', color: colors.ink },
    appleBtn: { marginTop: 12, width: '100%', height: 48 },
  });
}
