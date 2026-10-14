import React, { useState } from 'react';
import { View, TextInput, TextInputProps, Pressable, StyleProp, TextStyle, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../theme/ThemeContext';
import { useLocale } from '../i18n/LocaleContext';

// A password field with an eye button to show/hide what was typed. `style` is
// the same input style the screen already uses; its top margin moves to the
// wrapper so the eye stays centered on the field.
export function PasswordInput({ style, ...props }: Omit<TextInputProps, 'secureTextEntry' | 'style'> & { style?: StyleProp<TextStyle> }) {
  const colors = useColors();
  const { lang } = useLocale();
  const [visible, setVisible] = useState(false);
  const flat = StyleSheet.flatten(style) ?? {};
  const { marginTop, marginBottom, ...inputStyle } = flat;
  return (
    <View style={{ marginTop, marginBottom, justifyContent: 'center' }}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        autoCorrect={false}
        style={[inputStyle, { paddingRight: 48 }]}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          visible ? (lang === 'es' ? 'Ocultar contraseña' : 'Hide password') : lang === 'es' ? 'Mostrar contraseña' : 'Show password'
        }
        style={{ position: 'absolute', right: 6, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.ink3} />
      </Pressable>
    </View>
  );
}
