import React, { useMemo, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { spacing, ColorTokens, fonts } from '../theme';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';
import { PinPad } from '../components/PinPad';
import { PIN_LENGTH, setPin } from '../pin';

type Props = NativeStackScreenProps<RootStackParamList, 'PinSetup'>;

export function PinSetupScreen({ navigation, route }: Props) {
  const colors = useColors();
  const { t, lang } = useLocale();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const finishAfterSetting = () => {
    if (route.params?.thenFinishAuth) {
      if (route.params?.fromOnboarding) {
        navigation.replace('Tabs', { screen: 'Statements' });
      } else {
        navigation.goBack();
      }
    } else {
      navigation.goBack();
    }
  };

  const onChange = (next: string) => {
    setError(false);
    setValue(next);
    if (next.length < PIN_LENGTH) return;

    if (stage === 'enter') {
      setFirstPin(next);
      setValue('');
      setStage('confirm');
      return;
    }

    if (next === firstPin) {
      setPin(next)
        .then(finishAfterSetting)
        .catch(() => {
          Alert.alert(
            lang === 'es' ? 'No se pudo guardar el PIN' : 'Could not save the PIN',
            lang === 'es' ? 'Inténtalo de nuevo en un momento.' : 'Please try again in a moment.',
          );
          setStage('enter');
          setFirstPin('');
          setValue('');
        });
    } else {
      setError(true);
      setTimeout(() => {
        setStage('enter');
        setFirstPin('');
        setValue('');
        setError(false);
      }, 900);
    }
  };

  const title =
    stage === 'confirm'
      ? t.pinSetupTitleConfirm
      : route.params?.isChange
        ? t.pinSetupTitleChange
        : t.pinSetupTitleCreate;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {error && <Text style={styles.error}>{t.pinSetupMismatch}</Text>}
        <View style={styles.padWrap}>
          <PinPad length={PIN_LENGTH} value={value} onChange={onChange} error={error} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ColorTokens) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { flex: 1, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontFamily: fonts.display, color: colors.ink, textAlign: 'center', marginBottom: 32 },
    error: { fontSize: 13, color: colors.seg1, marginTop: -20, marginBottom: 20, textAlign: 'center' },
    padWrap: { alignItems: 'center' },
  });
}
