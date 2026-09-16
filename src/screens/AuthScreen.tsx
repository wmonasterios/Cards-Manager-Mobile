import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { radius, spacing, ColorTokens } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { BackButton } from '../components/BackButton';
import { Segmented } from '../components/Segmented';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;
type Mode = 'signin' | 'signup';

export function AuthScreen({ navigation }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error } = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setBusy(false);
    if (error) {
      Alert.alert('Could not sign in', error);
      return;
    }
    if (mode === 'signup') {
      Alert.alert('Account created', 'Check your email to confirm your account, then sign in.');
      setMode('signin');
      return;
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
  });
}
